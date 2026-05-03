"""Blade monitoring router — detect erosion, ice, and imbalance."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...monitoring.blade import BladeMonitoring, BladeCondition

router = APIRouter(prefix="/blade", tags=["blade_monitoring"])

# Global blade monitors per turbine
blade_monitors = {}


class BladeAnalysisRequest(BaseModel):
    """Input for blade health analysis."""
    turbine_id: str
    blade_id: str = Field(..., description="Blade identifier (1, 2, 3)")
    vibration_x: List[float] = Field(..., description="X-axis acceleration [m/s²]")
    vibration_y: List[float] = Field(..., description="Y-axis acceleration [m/s²]")
    power_output: float = Field(..., ge=0, description="Current power output [kW]")
    wind_speed: float = Field(..., ge=0, description="Wind speed [m/s]")
    temperature_c: float = Field(..., description="Ambient temperature [°C]")
    rotor_speed: float = Field(..., ge=0, description="Rotor speed [RPM]")
    fs: float = Field(100.0, gt=0, description="Sampling frequency [Hz]")


class BladeConditionResponse(BaseModel):
    """Blade health assessment response."""
    turbine_id: str
    blade_id: str
    erosion_severity: float = Field(..., ge=0, le=1)
    ice_buildup_severity: float = Field(..., ge=0, le=1)
    imbalance_severity: float = Field(..., ge=0, le=1)
    overall_health: float = Field(..., ge=0, le=1)
    recommendations: List[str]
    alert_level: str  # 'healthy', 'warning', 'critical'


class FleetBladeStatusResponse(BaseModel):
    """Fleet-wide blade status."""
    turbine_id: str
    num_blades: int
    blade_status: dict


@router.post("/analyze", response_model=BladeConditionResponse)
async def analyze_blade(
    request: BladeAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BladeConditionResponse:
    """Analyze blade health (erosion, ice, imbalance)."""

    # Verify turbine ownership
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Отримати or створити blade monitor
        if request.turbine_id not in blade_monitors:
            blade_monitors[request.turbine_id] = BladeMonitoring(
                num_blades=3,
                rotor_rpm=request.rotor_speed,
            )

        monitor = blade_monitors[request.turbine_id]

        # Convert signals to numpy arrays
        vib_x = np.array(request.vibration_x, dtype=np.float32)
        vib_y = np.array(request.vibration_y, dtype=np.float32)

        # Analyze blade
        condition: BladeCondition = monitor.analyze_blade(
            blade_id=request.blade_id,
            vibration_x=vib_x,
            vibration_y=vib_y,
            power_output=request.power_output,
            wind_speed=request.wind_speed,
            temperature_c=request.temperature_c,
            rotor_speed=request.rotor_speed,
            fs=request.fs,
        )

        logger.info(
            f"[{request.turbine_id}] Blade {request.blade_id}: "
            f"erosion={condition.erosion_severity:.2f}, "
            f"ice={condition.ice_buildup_severity:.2f}, "
            f"imbalance={condition.imbalance_severity:.2f}"
        )

        if condition.alert_level == "critical":
            logger.warning(
                f"[{request.turbine_id}] CRITICAL blade condition: {request.blade_id}"
            )

        return BladeConditionResponse(
            turbine_id=request.turbine_id,
            blade_id=request.blade_id,
            erosion_severity=condition.erosion_severity,
            ice_buildup_severity=condition.ice_buildup_severity,
            imbalance_severity=condition.imbalance_severity,
            overall_health=condition.overall_health,
            recommendations=condition.recommendations,
            alert_level=condition.alert_level,
        )

    except Exception as e:
        logger.error(f"Blade analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


@router.get("/fleet-status/{turbine_id}", response_model=FleetBladeStatusResponse)
async def get_fleet_blade_status(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FleetBladeStatusResponse:
    """Get blade status across all blades of turbine."""

    # Verify turbine ownership
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in blade_monitors:
        return FleetBladeStatusResponse(
            turbine_id=turbine_id,
            num_blades=3,
            blade_status={},
        )

    try:
        monitor = blade_monitors[turbine_id]
        status = monitor.get_fleet_blade_status()

        return FleetBladeStatusResponse(
            turbine_id=turbine_id,
            num_blades=monitor.num_blades,
            blade_status=status,
        )

    except Exception as e:
        logger.error(f"Fleet status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
