"""Віртуальні сенсори цифрового двійника на основі фільтра Калмана для оцінки стану."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, Optional, List
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...twin.kalman_filter import ExtendedKalmanFilter, KalmanState

router = APIRouter(prefix="/twin", tags=["digital_twin"])

# Глобальні фільтри Калмана для кожної турбіни
kalman_filters: Dict[str, ExtendedKalmanFilter] = {}


class SCADAMeasurement(BaseModel):
    """Вимірювання SCADA як вхід до фільтра Калмана."""
    turbine_id: str
    wind_speed: float = Field(..., description="Wind speed [m/s]")
    rotor_speed: float = Field(..., description="Rotor speed [RPM]")
    electrical_power: float = Field(..., description="Electrical power [kW]")
    pitch_angle: float = Field(..., description="Pitch angle [degrees]")
    tower_top_acceleration: Optional[float] = Field(None, description="Measured tower top accel [m/s²]")


class VirtualSensorEstimate(BaseModel):
    """Оцінені значення віртуальних сенсорів від фільтра Калмана."""
    turbine_id: str
    timestamp: str
    # Виміряні входи
    wind_speed: float
    rotor_speed: float
    electrical_power: float
    pitch_angle: float
    # Оцінені (віртуальні) виходи
    tower_base_moment_knm: float = Field(..., description="Estimated moment at tower base [kNm]")
    tower_top_acceleration: float = Field(..., description="Estimated top acceleration [m/s²]")
    tower_deflection_m: float = Field(..., description="Estimated tower tip deflection [m]")
    damage_accumulation_rate: float = Field(..., description="Damage rate [damage/day]")
    # Невизначеність
    estimation_confidence: float = Field(..., description="Confidence [0-1]")


class DigitalTwinConfig(BaseModel):
    """Конфігурація цифрового двійника."""
    turbine_id: str
    tower_height: float = Field(100.0, description="Tower height [m]")
    rotor_diameter: float = Field(120.0, description="Rotor diameter [m]")
    tower_mass: float = Field(500.0, description="Tower mass [tons]")


class BatchVirtualSensorRequest(BaseModel):
    """Запит на пакетну обробку кількох часових кроків."""
    turbine_id: str
    measurements: List[SCADAMeasurement]


class BatchVirtualSensorResult(BaseModel):
    """Результат пакетної оцінки."""
    turbine_id: str
    num_estimates: int
    estimates: List[Dict]
    average_damage_rate: float


@router.post("/configure/{turbine_id}")
async def configure_twin(
    turbine_id: str,
    config: DigitalTwinConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ініціалізує цифровий двійник для турбіни."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Ініціалізуємо фільтр Калмана для цієї турбіни
        ekf = ExtendedKalmanFilter()

        # Зберігаємо конфігурацію як метадані
        ekf.tower_height = config.tower_height
        ekf.rotor_diameter = config.rotor_diameter
        ekf.tower_mass = config.tower_mass

        kalman_filters[turbine_id] = ekf

        logger.info(f"Digital twin configured for {turbine_id}")

        return {
            "status": "configured",
            "turbine_id": turbine_id,
            "tower_height": config.tower_height,
            "rotor_diameter": config.rotor_diameter,
            "method": "Extended Kalman Filter",
        }

    except Exception as e:
        logger.error(f"Digital twin configuration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/estimate", response_model=VirtualSensorEstimate)
async def estimate_virtual_sensors(
    measurement: SCADAMeasurement,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VirtualSensorEstimate:
    """
    Оцінює невимірювані стани башти за допомогою віртуальних сенсорів (фільтра Калмана).

    Зі стандартних вимірювань SCADA (швидкість вітру, швидкість ротора, потужність, кут кроку)
    оцінює момент біля основи башти, відхилення, прискорення на верхівці та темп пошкодження.
    """

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == measurement.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if measurement.turbine_id not in kalman_filters:
        raise HTTPException(
            status_code=503,
            detail="Digital twin not configured for this turbine"
        )

    try:
        ekf = kalman_filters[measurement.turbine_id]

        # Готуємо вимірювання для фільтра Калмана
        # Z = [wind_speed, rotor_speed, electrical_power, measured_accel]
        Z = np.array([
            measurement.wind_speed,
            measurement.rotor_speed,
            measurement.electrical_power,
            measurement.tower_top_acceleration if measurement.tower_top_acceleration else 0.0,
        ])

        # Виконуємо прогноз + оновлення фільтра Калмана
        ekf.predict(dt=10.0)  # Крок часу 10 с (типова швидкість SCADA)
        ekf.update(Z)

        # Витягуємо оцінений стан
        state = ekf.get_state()

        # Оцінюємо впевненість на основі коваріації (менша невизначеність = більша впевненість)
        # Нормалізуємо слід коваріації до інтервалу [0, 1]
        cov_trace = np.trace(ekf.P)
        confidence = 1.0 / (1.0 + cov_trace)  # Метрика впевненості сигмоїдного типу

        logger.info(
            f"[{measurement.turbine_id}] Virtual sensors: "
            f"moment={state.tower_base_moment:.1f} kNm, "
            f"deflection={state.tower_deflection:.3f} m, "
            f"damage_rate={state.damage_rate:.6f}/day"
        )

        return VirtualSensorEstimate(
            turbine_id=measurement.turbine_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            wind_speed=measurement.wind_speed,
            rotor_speed=measurement.rotor_speed,
            electrical_power=measurement.electrical_power,
            pitch_angle=measurement.pitch_angle,
            tower_base_moment_knm=float(state.tower_base_moment),
            tower_top_acceleration=float(state.tower_top_accel),
            tower_deflection_m=float(state.tower_deflection),
            damage_accumulation_rate=float(state.damage_rate),
            estimation_confidence=float(confidence),
        )

    except Exception as e:
        logger.error(f"Virtual sensor estimation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/estimate-batch", response_model=BatchVirtualSensorResult)
async def estimate_batch(
    request: BatchVirtualSensorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BatchVirtualSensorResult:
    """Пакетна оцінка для кількох часових кроків."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in kalman_filters:
        raise HTTPException(status_code=503, detail="Digital twin not configured")

    try:
        ekf = kalman_filters[request.turbine_id]

        estimates = []
        damage_rates = []

        for meas in request.measurements:
            Z = np.array([
                meas.wind_speed,
                meas.rotor_speed,
                meas.electrical_power,
                meas.tower_top_acceleration if meas.tower_top_acceleration else 0.0,
            ])

            ekf.predict(dt=10.0)
            ekf.update(Z)

            state = ekf.get_state()
            cov_trace = np.trace(ekf.P)
            confidence = 1.0 / (1.0 + cov_trace)

            estimates.append({
                "wind_speed": meas.wind_speed,
                "tower_base_moment_knm": float(state.tower_base_moment),
                "tower_deflection_m": float(state.tower_deflection),
                "damage_rate": float(state.damage_rate),
                "confidence": float(confidence),
            })

            damage_rates.append(state.damage_rate)

        avg_damage_rate = float(np.mean(damage_rates)) if damage_rates else 0.0

        logger.info(
            f"[{request.turbine_id}] Batch estimation: {len(request.measurements)} steps, "
            f"avg_damage_rate={avg_damage_rate:.6f}/day"
        )

        return BatchVirtualSensorResult(
            turbine_id=request.turbine_id,
            num_estimates=len(estimates),
            estimates=estimates,
            average_damage_rate=avg_damage_rate,
        )

    except Exception as e:
        logger.error(f"Batch estimation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/state/{turbine_id}")
async def get_twin_state(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Повертає поточний стан цифрового двійника."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in kalman_filters:
        raise HTTPException(status_code=503, detail="Digital twin not configured")

    try:
        ekf = kalman_filters[turbine_id]
        state = ekf.get_state()

        return {
            "turbine_id": turbine_id,
            "tower_base_moment_knm": float(state.tower_base_moment),
            "tower_top_acceleration": float(state.tower_top_accel),
            "tower_deflection_m": float(state.tower_deflection),
            "damage_accumulation_rate": float(state.damage_rate),
            "state_covariance_trace": float(np.trace(ekf.P)),
        }

    except Exception as e:
        logger.error(f"Error retrieving twin state: {e}")
        raise HTTPException(status_code=500, detail=str(e))
