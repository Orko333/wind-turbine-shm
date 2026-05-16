"""Alerts endpoint — returns turbine alerts."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


_SEVERITY_BY_ALERT = {
    "YELLOW": "warning",
    "ORANGE": "warning",
    "RED": "critical",
}

_MESSAGE_BY_ALERT = {
    "YELLOW": "Накопичується втомне пошкодження — потрібна перевірка.",
    "ORANGE": "Підвищений рівень пошкодження, плануйте ТО.",
    "RED": "Критичне пошкодження — необхідне термінове втручання.",
}


@router.get("/")
async def list_alerts(
    turbine_id: str | None = Query(None),
    severity: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    """Return alerts derived from current turbine state."""
    q = db.query(Turbine).filter(
        Turbine.owner_id == current_user.id,
        Turbine.alert_level.in_(["YELLOW", "ORANGE", "RED"]),
    )
    if turbine_id:
        q = q.filter(Turbine.turbine_id == turbine_id)

    alerts: list[dict] = []
    for t in q.all():
        sev = _SEVERITY_BY_ALERT.get(t.alert_level, "info")
        if severity and sev != severity.lower():
            continue
        alerts.append(
            {
                "id": f"{t.turbine_id}-{t.alert_level}",
                "turbine_id": t.turbine_id,
                "turbine_name": t.name,
                "severity": sev,
                "level": t.alert_level,
                "message": _MESSAGE_BY_ALERT.get(t.alert_level, "Стан турбіни вимагає уваги."),
                "cumulative_damage": t.cumulative_damage,
                "rul_days": t.rul_days,
                "acknowledged": False,
                "created_at": (t.updated_at or datetime.now(timezone.utc)).isoformat(),
            }
        )
    return alerts


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    return {"status": "acknowledged", "alert_id": alert_id}
