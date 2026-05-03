"""Розширена аналітика — прогнозування RUL на базі PINN та діагностика дефектів."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine, TurbinePrediction
from ..dependencies import get_current_user
from ..model_registry import get_model_registry
from ...ml.diagnostics import DefectAnalysis

router = APIRouter(prefix="/advanced", tags=["advanced_analytics"])


class PINNInputRequest(BaseModel):
    """Вхідні дані для прогнозу PINN."""
    turbine_id: str
    scada_sequence: List[List[float]] = Field(
        ...,
        description="24-step sequence of [wind_speed, rotor_speed, pitch_angle, power, moment, accel, temp, strain]"
    )


class PINNPredictionResponse(BaseModel):
    """Вихід прогнозу PINN."""
    turbine_id: str
    damage: float = Field(..., ge=0, le=1)
    damage_rate: float = Field(..., ge=0, description="Damage per day")
    frequency_shift: float = Field(..., ge=-1, le=1)
    rul_days: Optional[float] = Field(None, ge=0, description="Remaining useful life")
    confidence: float = Field(..., ge=0, le=1)


class DefectDiagnosticsRequest(BaseModel):
    """Вхідні дані для діагностики дефектів."""
    turbine_id: str
    accel_signal: List[float] = Field(
        ...,
        description="Acceleration time series [m/s²]"
    )
    strain_signal: Optional[List[float]] = None
    deflection: float = Field(0.0, ge=0, description="Tower top deflection [m]")
    tilt_angle: float = Field(0.0, ge=0, description="Tower tilt angle [degrees]")
    damage_index: float = Field(0.0, ge=0, le=1)
    fs: float = Field(100.0, gt=0, description="Sampling frequency [Hz]")


class DefectDiagnosticsResponse(BaseModel):
    """Результати аналізу дефектів."""
    turbine_id: str
    defect_type: str
    severity: float = Field(..., ge=0, le=1)
    confidence: float = Field(..., ge=0, le=1)
    indicators: dict
    recommendations: List[str]
    alert_level: str  # 'healthy', 'warning', 'critical'


@router.post("/pinn-predict", response_model=PINNPredictionResponse)
async def pinn_predict(
    request: PINNInputRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PINNPredictionResponse:
    """Прогнозує пошкодження та RUL за допомогою фізично інформованої нейромережі."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    # Отримуємо модель PINN
    registry = get_model_registry()
    if not registry.pinn:
        raise HTTPException(status_code=503, detail="PINN model not available")

    try:
        # Перетворюємо послідовність у numpy-масив
        X = np.array(request.scada_sequence, dtype=np.float32)

        if X.shape != (24, 8):
            raise ValueError(f"Expected shape (24, 8), got {X.shape}")

        # Додаємо batch-розмір
        X = np.expand_dims(X, axis=0)

        # Прогноз
        damage, damage_rate, freq_shift = registry.pinn.predict(X)
        damage = float(damage[0, 0])
        damage_rate = float(damage_rate[0, 0])
        freq_shift = float(freq_shift[0, 0])

        # Оцінюємо RUL
        rul_days = float(registry.pinn.estimate_rul(X, current_damage=damage)[0])

        # Впевненість на основі темпу пошкодження (вищий темп = більша впевненість)
        confidence = min(1.0, 0.7 + 0.3 * damage_rate)

        # Зберігаємо прогноз у базу даних
        prediction = TurbinePrediction(
            turbine_id=turbine.id,
            method="pinn",
            damage_index=damage,
            damage_class="unknown",
            class_probabilities={"damage": damage, "damage_rate": damage_rate},
            rul_days=rul_days,
            del_mpa=None,
            input_features={
                "model": "PINN",
                "sequence_length": 24,
                "frequency_shift": freq_shift,
            },
        )
        db.add(prediction)
        db.commit()

        logger.info(
            f"[{request.turbine_id}] PINN prediction: damage={damage:.3f}, "
            f"damage_rate={damage_rate:.4f}, RUL={rul_days:.1f} days"
        )

        return PINNPredictionResponse(
            turbine_id=request.turbine_id,
            damage=damage,
            damage_rate=damage_rate,
            frequency_shift=freq_shift,
            rul_days=rul_days,
            confidence=confidence,
        )

    except Exception as e:
        logger.error(f"PINN prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"PINN prediction failed: {e}")


@router.post("/diagnose-defects", response_model=DefectDiagnosticsResponse)
async def diagnose_defects(
    request: DefectDiagnosticsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DefectDiagnosticsResponse:
    """Аналізує сигнали вібрацій та виявляє конкретні типи дефектів."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Отримуємо діагностичний рушій
        registry = get_model_registry()
        diagnostics = registry.diagnostics

        # Конвертуємо сигнали
        accel_signal = np.array(request.accel_signal, dtype=np.float32)
        strain_signal = (
            np.array(request.strain_signal, dtype=np.float32)
            if request.strain_signal
            else None
        )

        # Запускаємо комплексний аналіз
        analysis: DefectAnalysis = diagnostics.analyze(
            accel_signal=accel_signal,
            strain_signal=strain_signal,
            deflection=request.deflection,
            tilt_angle=request.tilt_angle,
            damage_index=request.damage_index,
            fs=request.fs,
        )

        # Визначаємо рівень тривоги
        if analysis.severity < 0.3:
            alert_level = "healthy"
        elif analysis.severity < 0.6:
            alert_level = "warning"
        else:
            alert_level = "critical"

        # Зберігаємо аналіз у базу даних
        prediction = TurbinePrediction(
            turbine_id=turbine.id,
            method="defect_diagnostics",
            damage_index=request.damage_index,
            damage_class=analysis.defect_type,
            class_probabilities=analysis.indicators,
            input_features={
                "model": "DefectDiagnostics",
                "defect_type": analysis.defect_type,
                "severity": analysis.severity,
                "confidence": analysis.confidence,
            },
        )
        db.add(prediction)
        db.commit()

        # Логуємо результат
        logger.info(
            f"[{request.turbine_id}] Defect diagnosis: {analysis.defect_type} "
            f"(severity={analysis.severity:.2f}, confidence={analysis.confidence:.2f})"
        )

        if alert_level == "critical":
            logger.warning(
                f"[{request.turbine_id}] CRITICAL DEFECT DETECTED: {analysis.defect_type}"
            )

        return DefectDiagnosticsResponse(
            turbine_id=request.turbine_id,
            defect_type=analysis.defect_type,
            severity=analysis.severity,
            confidence=analysis.confidence,
            indicators=analysis.indicators,
            recommendations=analysis.recommendations,
            alert_level=alert_level,
        )

    except Exception as e:
        logger.error(f"Defect diagnosis error: {e}")
        raise HTTPException(status_code=500, detail=f"Diagnosis failed: {e}")
