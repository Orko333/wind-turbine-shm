"""Alerts endpoint — returns turbine alerts."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...database.config import get_db
from ...database.models import User
from ..dependencies import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/")
async def list_alerts(
    turbine_id: str | None = Query(None),
    severity: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    """Return alerts for turbines owned by the current user."""
    # No alert model yet — return empty list so frontend doesn't crash
    return []


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    return {"status": "acknowledged", "alert_id": alert_id}
