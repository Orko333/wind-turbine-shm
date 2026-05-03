"""Роутер геодезичного моніторингу — осідання фундаменту та переміщення башти."""

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...monitoring.geodetic import GeodesticMonitoring, GeoPoint, SettlementAnalysis

router = APIRouter(prefix="/geodetic", tags=["geodetic_monitoring"])

# Глобальні геодезичні монітори для кожної турбіни
geodetic_monitors: Dict[str, GeodesticMonitoring] = {}


class SurveyPointInput(BaseModel):
    """Вимірювання знімальної точки."""
    point_id: str = Field(..., description="Point identifier")
    x: float = Field(..., description="East coordinate [m]")
    y: float = Field(..., description="North coordinate [m]")
    z: float = Field(..., description="Elevation [m]")
    precision: float = Field(0.01, description="Measurement precision [m]")


class SurveyEpochInput(BaseModel):
    """Повна епоха знімання."""
    turbine_id: str
    points: List[SurveyPointInput]


class SettlementResponse(BaseModel):
    """Відповідь з аналізом осідання."""
    turbine_id: str
    vertical_settlement: float = Field(..., description="Vertical settlement [mm]")
    horizontal_displacement: float = Field(..., description="Horizontal displacement [mm]")
    tilt_angle: float = Field(..., description="Tower tilt angle [degrees]")
    tilt_direction: str
    settlement_rate: float = Field(..., description="mm/year")
    alert_level: str  # 'healthy', 'warning', 'critical'
    recommendations: List[str]
    is_stable: bool


class SettlementProjectionResponse(BaseModel):
    """Відповідь з прогнозом осідання."""
    current_settlement: float
    annual_rate: float
    projected_settlement: float
    trend: str


@router.post("/initialize/{turbine_id}")
async def initialize_baseline(
    turbine_id: str,
    survey: SurveyEpochInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ініціалізує базове геодезичне знімання."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Створюємо базове знімання
        baseline = {}
        for point in survey.points:
            baseline[point.point_id] = GeoPoint(
                point_id=point.point_id,
                x=point.x,
                y=point.y,
                z=point.z,
                timestamp=str(__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()),
                precision=point.precision,
            )

        # Ініціалізуємо монітор
        geodetic_monitors[turbine_id] = GeodesticMonitoring(baseline)
        logger.info(f"Baseline survey initialized for {turbine_id} with {len(baseline)} points")

        return {
            "status": "initialized",
            "turbine_id": turbine_id,
            "num_points": len(baseline),
        }

    except Exception as e:
        logger.error(f"Baseline initialization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/measure/{turbine_id}", response_model=SettlementResponse)
async def measure_settlement(
    turbine_id: str,
    survey: SurveyEpochInput,
    foundation_point_ids: List[str] = Body(
        default=["FP1", "FP2", "FP3", "FP4"],
        description="Foundation anchor point IDs"
    ),
    tower_base_points: List[str] = Body(
        default=["TB"],
        description="Tower base point IDs"
    ),
    tower_top_points: List[str] = Body(
        default=["TT"],
        description="Tower top point IDs"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettlementResponse:
    """Реєструє нову епоху знімання та аналізує осідання."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in geodetic_monitors:
        raise HTTPException(status_code=503, detail="Baseline survey not initialized")

    try:
        # Перетворюємо вхідні дані на GeoPoints
        measured_points = {}
        for point in survey.points:
            measured_points[point.point_id] = GeoPoint(
                point_id=point.point_id,
                x=point.x,
                y=point.y,
                z=point.z,
                timestamp=str(__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()),
                precision=point.precision,
            )

        # Додаємо епоху до монітора
        monitor = geodetic_monitors[turbine_id]
        monitor.add_survey_epoch(measured_points)

        # Аналізуємо осідання
        analysis: SettlementAnalysis = monitor.analyze_settlement(
            turbine_id=turbine_id,
            foundation_point_ids=foundation_point_ids,
            tower_base_points=tower_base_points,
            tower_top_points=tower_top_points,
        )

        logger.info(
            f"[{turbine_id}] Settlement analysis: vertical={analysis.vertical_settlement:.1f}mm, "
            f"horizontal={analysis.horizontal_displacement:.1f}mm, "
            f"tilt={analysis.tilt_angle:.2f}°"
        )

        if not analysis.is_stable:
            logger.error(f"[{turbine_id}] ALERT: Foundation instability detected!")

        return SettlementResponse(
            turbine_id=analysis.turbine_id,
            vertical_settlement=analysis.vertical_settlement,
            horizontal_displacement=analysis.horizontal_displacement,
            tilt_angle=analysis.tilt_angle,
            tilt_direction=analysis.tilt_direction,
            settlement_rate=analysis.settlement_rate,
            alert_level=analysis.alert_level,
            recommendations=analysis.recommendations,
            is_stable=analysis.is_stable,
        )

    except Exception as e:
        logger.error(f"Settlement measurement error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projection/{turbine_id}", response_model=SettlementProjectionResponse)
async def get_settlement_projection(
    turbine_id: str,
    years_ahead: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettlementProjectionResponse:
    """Повертає прогноз осідання на основі тренду."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in geodetic_monitors:
        raise HTTPException(status_code=503, detail="No settlement data available")

    try:
        monitor = geodetic_monitors[turbine_id]
        projection = monitor.predict_settlement_projection(years_ahead=years_ahead)

        if 'error' in projection:
            raise HTTPException(status_code=400, detail=projection['error'])

        return SettlementProjectionResponse(
            current_settlement=projection['current_settlement'],
            annual_rate=projection['annual_rate'],
            projected_settlement=projection[f'projected_settlement_in_{years_ahead}_years'],
            trend=projection['trend'],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Projection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{turbine_id}")
async def get_settlement_history(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Повертає повну історію осідання."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in geodetic_monitors:
        return {"turbine_id": turbine_id, "history": []}

    try:
        monitor = geodetic_monitors[turbine_id]
        history = monitor.get_settlement_history()

        return {
            "turbine_id": turbine_id,
            "num_epochs": len(monitor.measurement_history),
            "history": history,
        }

    except Exception as e:
        logger.error(f"History retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
