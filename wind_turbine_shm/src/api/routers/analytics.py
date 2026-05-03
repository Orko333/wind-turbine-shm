"""Analytics and reports — historical data and trends."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from pydantic import BaseModel

from ...database.config import get_db
from ...database.models import User, Turbine, TurbinePrediction
from ..dependencies import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


class DamageStatistics(BaseModel):
    turbine_id: str
    count: int
    avg_damage: float
    max_damage: float
    min_damage: float
    latest_alert_level: str


class TurbineFleetSummary(BaseModel):
    total_turbines: int
    green_turbines: int
    yellow_turbines: int
    orange_turbines: int
    red_turbines: int
    avg_damage: float


class PredictionStats(BaseModel):
    date: str
    count: int
    avg_damage: float
    critical_count: int


@router.get("/turbine/{turbine_id}/damage-stats", response_model=DamageStatistics)
async def get_turbine_damage_stats(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DamageStatistics:
    """Get damage statistics for a turbine."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail=f"Турбіну '{turbine_id}' не знайдено.")

    # Отримати damage statistics
    predictions = db.query(TurbinePrediction).filter(
        TurbinePrediction.turbine_id == turbine.id
    ).all()

    if not predictions:
        return DamageStatistics(
            turbine_id=turbine_id,
            count=0,
            avg_damage=0.0,
            max_damage=0.0,
            min_damage=0.0,
            latest_alert_level=turbine.alert_level,
        )

    damages = [p.damage_index for p in predictions]
    return DamageStatistics(
        turbine_id=turbine_id,
        count=len(predictions),
        avg_damage=float(sum(damages) / len(damages)),
        max_damage=float(max(damages)),
        min_damage=float(min(damages)),
        latest_alert_level=turbine.alert_level,
    )


@router.get("/fleet-summary", response_model=TurbineFleetSummary)
async def get_fleet_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TurbineFleetSummary:
    """Get summary statistics for all user's turbines."""
    turbines = db.query(Turbine).filter(Turbine.owner_id == current_user.id).all()

    if not turbines:
        return TurbineFleetSummary(
            total_turbines=0,
            green_turbines=0,
            yellow_turbines=0,
            orange_turbines=0,
            red_turbines=0,
            avg_damage=0.0,
        )

    alert_counts = {"GREEN": 0, "YELLOW": 0, "ORANGE": 0, "RED": 0}
    damages = []

    for turbine in turbines:
        alert_counts[turbine.alert_level] += 1
        damages.append(turbine.cumulative_damage)

    return TurbineFleetSummary(
        total_turbines=len(turbines),
        green_turbines=alert_counts["GREEN"],
        yellow_turbines=alert_counts["YELLOW"],
        orange_turbines=alert_counts["ORANGE"],
        red_turbines=alert_counts["RED"],
        avg_damage=float(sum(damages) / len(damages)) if damages else 0.0,
    )


@router.get("/turbine/{turbine_id}/daily-predictions")
async def get_daily_predictions(
    turbine_id: str,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PredictionStats]:
    """Get daily prediction statistics for a turbine."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail=f"Турбіну '{turbine_id}' не знайдено.")

    # Отримати predictions from past N days
    since = datetime.utcnow() - timedelta(days=days)
    predictions = (
        db.query(TurbinePrediction)
        .filter(
            (TurbinePrediction.turbine_id == turbine.id)
            & (TurbinePrediction.created_at >= since)
        )
        .order_by(desc(TurbinePrediction.created_at))
        .all()
    )

    # Group by date
    from collections import defaultdict
    daily = defaultdict(list)
    for pred in predictions:
        date = pred.created_at.date().isoformat()
        daily[date].append(pred)

    # Build response
    result = []
    for date in sorted(daily.keys()):
        preds = daily[date]
        damages = [p.damage_index for p in preds]
        critical = sum(1 for p in preds if p.damage_class == "Critical")

        result.append(
            PredictionStats(
                date=date,
                count=len(preds),
                avg_damage=float(sum(damages) / len(damages)),
                critical_count=critical,
            )
        )

    return result


@router.get("/turbine/{turbine_id}/rul-trend")
async def get_rul_trend(
    turbine_id: str,
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get RUL trend for a turbine."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail=f"Турбіну '{turbine_id}' не знайдено.")

    predictions = (
        db.query(TurbinePrediction)
        .filter(TurbinePrediction.turbine_id == turbine.id)
        .order_by(desc(TurbinePrediction.created_at))
        .limit(limit)
        .all()
    )

    return {
        "turbine_id": turbine_id,
        "predictions": [
            {
                "timestamp": p.created_at.isoformat(),
                "rul_days": p.rul_days,
                "damage_index": p.damage_index,
                "alert_level": p.alert_level,
            }
            for p in reversed(predictions)
        ],
    }
