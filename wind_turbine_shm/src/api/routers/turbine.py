"""Turbine management — CRUD operations and health status."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends, status, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, Field
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine, TurbinePrediction, AuditLog
from ..schemas import (
    TurbineCreateRequest,
    TurbineUpdateRequest,
    TurbineDetailResponse,
    TurbineStatusResponse,
    TurbinePredictionListResponse,
    PredictionHistoryResponse,
    AlertLevel,
)
from ..dependencies import get_current_user
from ...scada.realtime_simulator import realtime_registry

router = APIRouter(prefix="/turbines", tags=["turbines"], redirect_slashes=False)


def _log_audit(
    db: Session,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: dict = None,
    status: str = "success",
    error_message: str = None,
):
    """Helper to log audit events."""
    audit = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        status=status,
        error_message=error_message,
    )
    db.add(audit)
    db.commit()


@router.post("/", response_model=TurbineDetailResponse, status_code=201)
async def create_turbine(
    request: TurbineCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineDetailResponse:
    """Create a new turbine."""
    # Check if turbine already exists for this user
    existing = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Турбіна '{request.turbine_id}' вже існує.",
        )

    try:
        turbine = Turbine(
            turbine_id=request.turbine_id,
            owner_id=current_user.id,
            name=request.name,
            location=request.location,
            manufacturer=request.manufacturer,
            model=request.model,
            rated_power_kw=request.rated_power_kw,
            installation_date=(
                datetime.fromisoformat(request.installation_date)
                if request.installation_date
                else None
            ),
        )
        db.add(turbine)
        db.commit()
        db.refresh(turbine)

        _log_audit(
            db,
            str(current_user.id),
            "create_turbine",
            "turbine",
            request.turbine_id,
            {"name": request.name, "manufacturer": request.manufacturer},
        )

        logger.info(f"Турбіну '{request.turbine_id}' створено користувачем {current_user.username}")

        return TurbineDetailResponse(
            id=str(turbine.id),
            turbine_id=turbine.turbine_id,
            name=turbine.name,
            location=turbine.location,
            manufacturer=turbine.manufacturer,
            model=turbine.model,
            rated_power_kw=turbine.rated_power_kw,
            installation_date=(
                turbine.installation_date.isoformat() if turbine.installation_date else None
            ),
            cumulative_damage=turbine.cumulative_damage,
            damage_fraction=turbine.damage_fraction,
            alert_level=AlertLevel(turbine.alert_level),
            rul_days=turbine.rul_days,
            total_records_processed=turbine.total_records_processed,
            last_prediction_at=(
                turbine.last_prediction_at.isoformat() if turbine.last_prediction_at else None
            ),
            created_at=turbine.created_at.isoformat(),
            updated_at=turbine.updated_at.isoformat(),
        )
    except Exception as e:
        logger.error(f"Помилка при створенні турбіни: {e}")
        _log_audit(
            db,
            str(current_user.id),
            "create_turbine",
            "turbine",
            request.turbine_id,
            status="failure",
            error_message=str(e),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{turbine_id}")
async def get_turbine(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get turbine details (same shape as the list endpoint, with realtime
    fields + geometry from the model metadata)."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    return _turbine_to_dashboard(turbine)


def _alert_to_status(alert_level: str) -> str:
    return {"GREEN": "healthy", "YELLOW": "warning", "ORANGE": "warning", "RED": "critical"}.get(
        alert_level, "healthy"
    )


_MODEL_GEOMETRY = {
    "V150-4.5":   {"rotor_diameter_m": 150.0, "tower_height_m": 105.0},
    "SG 5.0-145": {"rotor_diameter_m": 145.0, "tower_height_m": 107.5},
    "Haliade-X":  {"rotor_diameter_m": 220.0, "tower_height_m": 135.0},
    "N163/5.X":   {"rotor_diameter_m": 163.0, "tower_height_m": 120.0},
}


def _geometry_for(model: str | None, rated_kw: float | None) -> tuple[float, float]:
    """Return (rotor_diameter_m, tower_height_m) for the turbine model.

    Falls back to a power-law estimate when the model is unknown:
    D ≈ 9.5 * sqrt(P_rated_kW), H ≈ 0.7 * D — empirical fit across modern
    multi-MW machines.
    """
    if model and model in _MODEL_GEOMETRY:
        g = _MODEL_GEOMETRY[model]
        return g["rotor_diameter_m"], g["tower_height_m"]
    rated = float(rated_kw or 2000.0)
    diameter = round(9.5 * (rated ** 0.5), 1)
    return diameter, round(diameter * 0.7, 1)


def _turbine_to_dashboard(t: Turbine) -> dict:
    """Map DB model → frontend-compatible Turbine shape.

    Realtime fields (power_kw, wind_speed, rotor_rpm) come from the in-memory
    realtime simulator state for this turbine — same source that the /ws
    stream and /scada/history use. No hardcoded constants.
    """
    rated = t.rated_power_kw or 2000.0
    status = _alert_to_status(t.alert_level)
    rotor_d, tower_h = _geometry_for(t.model, rated)
    # Prime the simulator with the persisted damage so its trajectory matches
    # what the rest of the app shows, then snapshot (no DB write).
    state = realtime_registry.get_or_create(t.turbine_id)
    if state.cumulative_damage == 0.0 and (t.cumulative_damage or 0) > 0:
        state.prime(cumulative_damage=float(t.cumulative_damage))
    sample = state.tick()
    power_now = 0.0 if status == "offline" else sample.power_kw
    return {
        "id": str(t.id),
        "turbine_id": t.turbine_id,
        "name": t.name,
        "location": t.location or "",
        "manufacturer": t.manufacturer or "",
        "model": t.model or "",
        "rated_power_kw": rated,
        "rotor_diameter_m": rotor_d,
        "tower_height_m": tower_h,
        "status": status,
        "power_kw": power_now,
        "wind_speed": sample.wind_speed,
        "rotor_rpm": sample.rotor_rpm,
        "rul_years": round((t.rul_days / 365.0) if t.rul_days else 12.0, 1),
        "damage_rate": round((t.cumulative_damage or 0) * 100 / max(0.1, (t.rul_days or 7300) / 365.0), 2),
        "cumulative_damage": t.cumulative_damage,
        "damage_fraction": t.damage_fraction,
        "alert_level": t.alert_level,
        "rul_days": t.rul_days,
        "total_records_processed": t.total_records_processed,
        "installation_date": t.installation_date.isoformat() if t.installation_date else None,
        "last_prediction_at": t.last_prediction_at.isoformat() if t.last_prediction_at else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


_DEMO_TURBINES = [
    {"turbine_id": "WT-001", "name": "Wind Turbine 001", "location": "North Field",  "manufacturer": "Vestas",  "model": "V150-4.5",   "rated_power_kw": 4500, "alert_level": "GREEN",  "cumulative_damage": 0.08},
    {"turbine_id": "WT-002", "name": "Wind Turbine 002", "location": "North Field",  "manufacturer": "Vestas",  "model": "V150-4.5",   "rated_power_kw": 4500, "alert_level": "GREEN",  "cumulative_damage": 0.12},
    {"turbine_id": "WT-003", "name": "Wind Turbine 003", "location": "South Ridge",  "manufacturer": "Siemens", "model": "SG 5.0-145", "rated_power_kw": 5000, "alert_level": "YELLOW", "cumulative_damage": 0.31},
    {"turbine_id": "WT-004", "name": "Wind Turbine 004", "location": "South Ridge",  "manufacturer": "Siemens", "model": "SG 5.0-145", "rated_power_kw": 5000, "alert_level": "GREEN",  "cumulative_damage": 0.15},
    {"turbine_id": "WT-005", "name": "Wind Turbine 005", "location": "East Hill",    "manufacturer": "GE",      "model": "Haliade-X",  "rated_power_kw": 6000, "alert_level": "ORANGE", "cumulative_damage": 0.52},
    {"turbine_id": "WT-006", "name": "Wind Turbine 006", "location": "East Hill",    "manufacturer": "GE",      "model": "Haliade-X",  "rated_power_kw": 6000, "alert_level": "GREEN",  "cumulative_damage": 0.09},
    {"turbine_id": "WT-007", "name": "Wind Turbine 007", "location": "West Coast",   "manufacturer": "Nordex",  "model": "N163/5.X",   "rated_power_kw": 5700, "alert_level": "RED",    "cumulative_damage": 0.78},
    {"turbine_id": "WT-008", "name": "Wind Turbine 008", "location": "West Coast",   "manufacturer": "Nordex",  "model": "N163/5.X",   "rated_power_kw": 5700, "alert_level": "GREEN",  "cumulative_damage": 0.11},
]


def _ensure_demo_turbines(db: Session, user: User) -> None:
    """Auto-create demo turbines for a user that has none (demo/ephemeral-DB mode)."""
    prefix = (user.username[:4].upper() if user.username else "USR")
    for td in _DEMO_TURBINES:
        suffix = td["turbine_id"].replace("WT-", "")
        turbine_id = f"{prefix}-{suffix}"
        exists = db.query(Turbine).filter(
            (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == user.id)
        ).first()
        if not exists:
            db.add(Turbine(
                turbine_id=turbine_id,
                owner_id=user.id,
                name=td["name"],
                location=td["location"],
                manufacturer=td["manufacturer"],
                model=td["model"],
                rated_power_kw=td["rated_power_kw"],
                alert_level=td["alert_level"],
                cumulative_damage=td["cumulative_damage"],
                damage_fraction=td["cumulative_damage"],
                rul_days=round(365 * 20 * (1 - td["cumulative_damage"]), 0),
                installation_date=datetime(2018, 6, 1, tzinfo=timezone.utc),
            ))
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Could not auto-create demo turbines: {e}")


@router.get("/")
async def list_turbines(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: str | None = Query(None),
    location: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """List turbines for the current user with pagination."""
    q = db.query(Turbine).filter(Turbine.owner_id == current_user.id)
    if q.count() == 0:
        _ensure_demo_turbines(db, current_user)
    if location:
        q = q.filter(Turbine.location.ilike(f"%{location}%"))
    total = q.count()
    turbines = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"data": [_turbine_to_dashboard(t) for t in turbines], "total": total}


@router.patch("/{turbine_id}", response_model=TurbineDetailResponse)
async def update_turbine(
    turbine_id: str,
    request: TurbineUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineDetailResponse:
    """Update turbine metadata."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    # Оновити fields if provided
    if request.name is not None:
        turbine.name = request.name
    if request.location is not None:
        turbine.location = request.location
    if request.manufacturer is not None:
        turbine.manufacturer = request.manufacturer
    if request.model is not None:
        turbine.model = request.model
    if request.rated_power_kw is not None:
        turbine.rated_power_kw = request.rated_power_kw
    if request.description is not None:
        turbine.description = request.description

    turbine.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(turbine)

    _log_audit(
        db,
        str(current_user.id),
        "update_turbine",
        "turbine",
        turbine_id,
        request.dict(exclude_none=True),
    )

    logger.info(f"Турбіну '{turbine_id}' оновлено")

    return TurbineDetailResponse(
        id=str(turbine.id),
        turbine_id=turbine.turbine_id,
        name=turbine.name,
        location=turbine.location,
        manufacturer=turbine.manufacturer,
        model=turbine.model,
        rated_power_kw=turbine.rated_power_kw,
        installation_date=turbine.installation_date.isoformat() if turbine.installation_date else None,
        cumulative_damage=turbine.cumulative_damage,
        damage_fraction=turbine.damage_fraction,
        alert_level=AlertLevel(turbine.alert_level),
        rul_days=turbine.rul_days,
        total_records_processed=turbine.total_records_processed,
        last_prediction_at=turbine.last_prediction_at.isoformat() if turbine.last_prediction_at else None,
        created_at=turbine.created_at.isoformat(),
        updated_at=turbine.updated_at.isoformat(),
    )


class ScenarioRequest(BaseModel):
    """Stress-test / aging scenario payload."""

    years_operated: Optional[float] = Field(
        None, ge=0, le=40,
        description="Симуляція напрацювання років (з 20-річного проектного ресурсу).",
    )
    target_damage: Optional[float] = Field(
        None, ge=0.0, le=1.0,
        description="Цільова частка пошкодження Палмгрена-Майнера (0..1).",
    )
    alert_level: Optional[AlertLevel] = Field(
        None, description="Примусово виставити рівень тривоги.",
    )
    rul_days: Optional[float] = Field(
        None, ge=0,
        description="Залишковий ресурс у днях (за замовч. розраховується з пошкодження).",
    )
    damage_rate_multiplier: Optional[float] = Field(
        None, ge=0.0, le=1000.0,
        description="Прискорення накопичення пошкодження в реал-тайм симуляції.",
    )
    wind_severity: Optional[float] = Field(
        None, ge=0.1, le=5.0,
        description="Множник інтенсивності вітру (1.0 = норма).",
    )
    fault_mode: Optional[str] = Field(
        None,
        description="Тип несправності: gearbox | blade | tower.",
        pattern="^(gearbox|blade|tower)$",
    )
    reset: bool = Field(False, description="Скинути сценарій до нормального стану.")


def _damage_to_alert(damage: float) -> AlertLevel:
    if damage >= 0.75:
        return AlertLevel.RED
    if damage >= 0.55:
        return AlertLevel.ORANGE
    if damage >= 0.30:
        return AlertLevel.YELLOW
    return AlertLevel.GREEN


@router.post("/{turbine_id}/scenario", response_model=TurbineDetailResponse)
async def apply_scenario(
    turbine_id: str,
    request: ScenarioRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineDetailResponse:
    """Apply a stress-test / aging scenario to a turbine.

    Корисно для демонстрації реакції системи: алерти, втомний знос, ML
    класифікатор, real-time SCADA-сигнали. Стан зберігається у БД та
    застосовується до симулятора реального часу.
    """
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()
    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    if request.reset:
        turbine.cumulative_damage = 0.0
        turbine.damage_fraction = 0.0
        turbine.alert_level = AlertLevel.GREEN.value
        turbine.rul_days = 20.0 * 365.0
        turbine.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(turbine)
        realtime_registry.reset(turbine_id)
        _log_audit(
            db, str(current_user.id), "scenario_reset", "turbine", turbine_id,
            {"turbine_id": turbine_id},
        )
        logger.info(f"Сценарій скинуто для '{turbine_id}'")
    else:
        damage: Optional[float] = request.target_damage
        if damage is None and request.years_operated is not None:
            damage = min(0.95, float(request.years_operated) / 20.0)
        if damage is None and request.alert_level is None and not any([
            request.rul_days is not None,
            request.damage_rate_multiplier is not None,
            request.wind_severity is not None,
            request.fault_mode is not None,
        ]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Потрібно вказати хоча б один параметр сценарію.",
            )

        if damage is not None:
            damage = max(0.0, min(1.0, damage))
            turbine.cumulative_damage = damage
            turbine.damage_fraction = damage

        if request.alert_level is not None:
            turbine.alert_level = request.alert_level.value
        elif damage is not None:
            turbine.alert_level = _damage_to_alert(damage).value

        if request.rul_days is not None:
            turbine.rul_days = float(request.rul_days)
        elif damage is not None:
            turbine.rul_days = max(1.0, 20.0 * 365.0 * (1.0 - damage))

        if request.years_operated is not None:
            turbine.installation_date = datetime.now(timezone.utc) - timedelta(
                days=float(request.years_operated) * 365.0
            )

        turbine.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(turbine)

        realtime_registry.prime(
            turbine_id,
            cumulative_damage=turbine.cumulative_damage,
            damage_rate_multiplier=request.damage_rate_multiplier,
            wind_severity=request.wind_severity,
            fault_mode=request.fault_mode,
        )

        _log_audit(
            db, str(current_user.id), "scenario_apply", "turbine", turbine_id,
            request.dict(exclude_none=True),
        )
        logger.info(
            f"Сценарій застосовано до '{turbine_id}': "
            f"damage={turbine.cumulative_damage:.3f}, alert={turbine.alert_level}"
        )

    return TurbineDetailResponse(
        id=str(turbine.id),
        turbine_id=turbine.turbine_id,
        name=turbine.name,
        location=turbine.location,
        manufacturer=turbine.manufacturer,
        model=turbine.model,
        rated_power_kw=turbine.rated_power_kw,
        installation_date=(
            turbine.installation_date.isoformat() if turbine.installation_date else None
        ),
        cumulative_damage=turbine.cumulative_damage,
        damage_fraction=turbine.damage_fraction,
        alert_level=AlertLevel(turbine.alert_level),
        rul_days=turbine.rul_days,
        total_records_processed=turbine.total_records_processed,
        last_prediction_at=(
            turbine.last_prediction_at.isoformat() if turbine.last_prediction_at else None
        ),
        created_at=turbine.created_at.isoformat(),
        updated_at=turbine.updated_at.isoformat(),
    )


@router.delete("/{turbine_id}", status_code=204)
async def delete_turbine(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a turbine and all its predictions."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    db.delete(turbine)
    db.commit()

    _log_audit(
        db,
        str(current_user.id),
        "delete_turbine",
        "turbine",
        turbine_id,
    )

    logger.info(f"Турбіну '{turbine_id}' видалено")


@router.post("/{turbine_id}/reset", response_model=TurbineDetailResponse)
async def reset_turbine(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineDetailResponse:
    """Reset damage accumulator (e.g., after major repairs)."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    turbine.cumulative_damage = 0.0
    turbine.damage_fraction = 0.0
    turbine.alert_level = "GREEN"
    turbine.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(turbine)

    _log_audit(
        db,
        str(current_user.id),
        "reset_turbine",
        "turbine",
        turbine_id,
        {"reason": "damage_accumulator_reset"},
    )

    logger.info(f"Акумулятор пошкодження турбіни '{turbine_id}' скинуто")

    return TurbineDetailResponse(
        id=str(turbine.id),
        turbine_id=turbine.turbine_id,
        name=turbine.name,
        location=turbine.location,
        manufacturer=turbine.manufacturer,
        model=turbine.model,
        rated_power_kw=turbine.rated_power_kw,
        installation_date=turbine.installation_date.isoformat() if turbine.installation_date else None,
        cumulative_damage=turbine.cumulative_damage,
        damage_fraction=turbine.damage_fraction,
        alert_level=AlertLevel(turbine.alert_level),
        rul_days=turbine.rul_days,
        total_records_processed=turbine.total_records_processed,
        last_prediction_at=turbine.last_prediction_at.isoformat() if turbine.last_prediction_at else None,
        created_at=turbine.created_at.isoformat(),
        updated_at=turbine.updated_at.isoformat(),
    )


@router.get("/{turbine_id}/predictions", response_model=TurbinePredictionListResponse)
async def get_turbine_predictions(
    turbine_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbinePredictionListResponse:
    """Get prediction history for a turbine."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
        )

    # Отримати total count
    total_count = db.query(TurbinePrediction).filter(TurbinePrediction.turbine_id == turbine.id).count()

    # Отримати paginated predictions
    predictions = (
        db.query(TurbinePrediction)
        .filter(TurbinePrediction.turbine_id == turbine.id)
        .order_by(TurbinePrediction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return TurbinePredictionListResponse(
        turbine_id=turbine_id,
        total_count=total_count,
        limit=limit,
        offset=offset,
        predictions=[
            PredictionHistoryResponse(
                id=str(p.id),
                turbine_id=turbine_id,
                prediction_timestamp=p.prediction_timestamp.isoformat(),
                damage_index=p.damage_index,
                damage_class=p.damage_class,
                class_probabilities=p.class_probabilities,
                rul_days=p.rul_days,
                rul_confidence_lower=p.rul_confidence_lower,
                rul_confidence_upper=p.rul_confidence_upper,
                del_mpa=p.del_mpa,
                alert_level=AlertLevel(p.alert_level),
                alert_message=p.alert_message,
                created_at=p.created_at.isoformat(),
            )
            for p in predictions
        ],
    )
