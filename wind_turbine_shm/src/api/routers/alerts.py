"""Alerts endpoint — returns turbine alerts."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from loguru import logger

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


def _load_notification_rules(db: Session, user_id) -> list[dict]:
    """Load user's NotificationRules from user_storage (namespace=config,
    key=notification-rules). Returns empty list if nothing saved."""
    try:
        from .user_storage import UserStorage
        row = (
            db.query(UserStorage)
            .filter(UserStorage.user_id == str(user_id))
            .filter(UserStorage.namespace == "config")
            .filter(UserStorage.key == "notification-rules")
            .first()
        )
        if not row:
            return []
        parsed = json.loads(row.value)
        return parsed if isinstance(parsed, list) else []
    except Exception as exc:
        logger.warning(f"notification-rules load failed: {exc}")
        return []


def _eval_rule(rule: dict, t: Turbine) -> bool:
    """Return True if this rule's condition holds for this turbine right now."""
    if not rule.get("enabled"):
        return False
    metric = rule.get("metric", "")
    op = rule.get("operator", "greater_than")
    try:
        threshold = float(rule.get("threshold", 0))
    except (TypeError, ValueError):
        return False

    # Map UI metric names → current turbine values.
    rul_days = float(t.rul_days or 0)
    rul_months = rul_days / 30.0
    damage_pct = float(t.cumulative_damage or 0) * 100.0
    value_by_metric = {
        "remaining_useful_life_months": rul_months,
        "remaining_useful_life_years": rul_days / 365.0,
        "cumulative_damage_percent": damage_pct,
        "cumulative_damage": float(t.cumulative_damage or 0),
        # Realtime-ish metrics — best-effort from the simulator, optional.
    }
    if metric not in value_by_metric:
        # Pull realtime fields if requested.
        try:
            from ...scada.realtime_simulator import realtime_registry
            sample = realtime_registry.get_or_create(t.turbine_id).tick()
            value_by_metric.update({
                "power_output_kw": sample.power_kw,
                "vibration_amplitude_mms": sample.vibration_mms,
                "wind_speed_ms": sample.wind_speed,
                "rotor_rpm": sample.rotor_rpm,
                "temperature_c": sample.temperature_c,
            })
        except Exception:
            pass

    value = value_by_metric.get(metric)
    if value is None:
        return False

    if op == "greater_than":
        return value > threshold
    if op == "less_than":
        return value < threshold
    if op == "equals":
        return abs(value - threshold) < 1e-6
    return False


@router.get("/")
async def list_alerts(
    turbine_id: str | None = Query(None),
    severity: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    """Return alerts derived from current turbine state.

    Two sources:
    1. Built-in alert_level (YELLOW/ORANGE/RED) — fleet's own assessment.
    2. User-defined NotificationRules from /config — these add custom-named
       alerts when their threshold metric exceeds the user's value.
    """
    rules = _load_notification_rules(db, current_user.id)

    q = db.query(Turbine).filter(Turbine.owner_id == current_user.id)
    if turbine_id:
        q = q.filter(Turbine.turbine_id == turbine_id)
    all_turbines = q.all()

    alerts: list[dict] = []
    for t in all_turbines:
        # 1. Built-in level alert
        if t.alert_level in ("YELLOW", "ORANGE", "RED"):
            sev = _SEVERITY_BY_ALERT.get(t.alert_level, "info")
            if not severity or sev == severity.lower():
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

        # 2. User-defined rule alerts
        for rule in rules:
            try:
                if not _eval_rule(rule, t):
                    continue
            except Exception as exc:
                logger.warning(f"rule {rule.get('id')} eval failed for {t.turbine_id}: {exc}")
                continue
            sev = (rule.get("severity") or "warning").lower()
            if severity and sev != severity.lower():
                continue
            alerts.append(
                {
                    "id": f"{t.turbine_id}-rule-{rule.get('id', 'x')}",
                    "turbine_id": t.turbine_id,
                    "turbine_name": t.name,
                    "severity": sev,
                    "level": rule.get("severity", "warning").upper(),
                    "message": rule.get("name") or f"Правило {rule.get('metric')}",
                    "rule_metric": rule.get("metric"),
                    "rule_threshold": rule.get("threshold"),
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
