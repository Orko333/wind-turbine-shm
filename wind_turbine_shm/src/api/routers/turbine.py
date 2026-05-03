"""Turbine management — CRUD operations and health status."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends, status, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
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
    # Check if turbine already exists
    existing = db.query(Turbine).filter(Turbine.turbine_id == request.turbine_id).first()
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


@router.get("/{turbine_id}", response_model=TurbineDetailResponse)
async def get_turbine(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineDetailResponse:
    """Get turbine details."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Турбіну '{turbine_id}' не знайдено.",
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


def _alert_to_status(alert_level: str) -> str:
    return {"GREEN": "healthy", "YELLOW": "warning", "ORANGE": "warning", "RED": "critical"}.get(
        alert_level, "healthy"
    )


def _turbine_to_dashboard(t: Turbine) -> dict:
    """Map DB model → frontend-compatible Turbine shape."""
    rated = t.rated_power_kw or 2000.0
    status = _alert_to_status(t.alert_level)
    return {
        "id": str(t.id),
        "turbine_id": t.turbine_id,
        "name": t.name,
        "location": t.location or "",
        "manufacturer": t.manufacturer or "",
        "model": t.model or "",
        "rated_power_kw": rated,
        "status": status,
        "power_kw": rated * 0.7 if status != "offline" else 0.0,
        "wind_speed": 10.5,
        "rotor_rpm": 15.2,
        "rul_years": round((t.rul_days / 365.0) if t.rul_days else 12.0, 1),
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
