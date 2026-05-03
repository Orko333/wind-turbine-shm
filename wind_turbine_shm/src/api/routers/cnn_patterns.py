"""Розпізнавання патернів пошкоджень на віброспектрограмах за допомогою CNN."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...ml.cnn import SpectrogramCNN, SpectrogramGenerator

router = APIRouter(prefix="/cnn", tags=["cnn"])

# Глобальні CNN-моделі для кожної турбіни
cnn_models: Dict[str, SpectrogramCNN] = {}


class CNNDamageRequest(BaseModel):
    """Запит на виявлення патерну пошкодження з вібраційного сигналу."""
    turbine_id: str
    signal_data: List[float] = Field(..., description="Acceleration signal [m/s²]")
    fs: float = Field(100.0, description="Sampling frequency [Hz]")
    signal_duration_sec: float = Field(10.0, description="Signal duration [seconds]")


class DamageDetectionResult(BaseModel):
    """Результат виявлення пошкодження CNN."""
    turbine_id: str
    damage_class: str = Field(..., description="healthy/degraded/critical")
    confidence: float = Field(..., description="Confidence [0-1]")
    probabilities: Dict[str, float] = Field(..., description="Class probabilities")
    alert: bool = Field(..., description="True if damage detected above threshold")
    spectrogram_shape: tuple = Field(..., description="Spectrogram dimensions")


class BatchDamageDetectionRequest(BaseModel):
    """Запит на пакетне виявлення пошкоджень."""
    turbine_id: str
    signal_batches: List[List[float]] = Field(..., description="List of acceleration signals")
    fs: float = Field(100.0, description="Sampling frequency [Hz]")


class BatchDamageDetectionResult(BaseModel):
    """Результат пакетного виявлення."""
    turbine_id: str
    total_signals: int
    damaged_count: int
    healthy_count: int
    critical_count: int
    average_confidence: float
    results: List[Dict]


class CNNConfig(BaseModel):
    """Конфігурація моделі CNN."""
    spectrogram_time_bins: int = Field(128, description="Time dimension of spectrogram")
    spectrogram_freq_bins: int = Field(256, description="Frequency dimension")
    num_classes: int = Field(3, description="Number of damage classes")


@router.post("/configure/{turbine_id}")
async def configure_cnn(
    turbine_id: str,
    config: CNNConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Налаштовує модель CNN для турбіни."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        cnn_shape = (config.spectrogram_time_bins, config.spectrogram_freq_bins)
        cnn = SpectrogramCNN(
            spectrogram_shape=cnn_shape,
            num_classes=config.num_classes,
        )
        cnn.build_model()

        cnn_models[turbine_id] = cnn

        logger.info(f"CNN model configured for {turbine_id}: shape={cnn_shape}")

        return {
            "status": "configured",
            "turbine_id": turbine_id,
            "spectrogram_shape": cnn_shape,
            "num_classes": config.num_classes,
            "model_type": "SpectrogramCNN",
        }

    except Exception as e:
        logger.error(f"CNN configuration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-damage", response_model=DamageDetectionResult)
async def detect_damage(
    request: CNNDamageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DamageDetectionResult:
    """Виявляє структурні пошкодження з вібраційного сигналу за допомогою CNN."""

    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in cnn_models:
        raise HTTPException(
            status_code=503,
            detail="CNN model not configured for this turbine"
        )

    try:
        signal = np.array(request.signal_data, dtype=np.float32)

        # Генеруємо спектрограму
        cnn = cnn_models[request.turbine_id]
        spec_shape = cnn.spectrogram_shape

        spectrogram = SpectrogramGenerator.create_spectrogram(
            signal,
            fs=request.fs,
            nperseg=spec_shape[1] // 2,
        )

        # Зміна розміру до цільової форми
        from PIL import Image
        pil_image = Image.fromarray((spectrogram * 255).astype(np.uint8))
        pil_image = pil_image.resize(spec_shape[::-1], Image.LANCZOS)
        spec_resized = np.array(pil_image) / 255.0

        # Прогноз
        prediction = cnn.predict(spec_resized)

        logger.info(
            f"[{request.turbine_id}] Damage detection: {prediction['class']} "
            f"(confidence={prediction['confidence']:.2%})"
        )

        return DamageDetectionResult(
            turbine_id=request.turbine_id,
            damage_class=prediction["class"],
            confidence=prediction["confidence"],
            probabilities=prediction["probabilities"],
            alert=prediction["alert"],
            spectrogram_shape=spec_shape,
        )

    except Exception as e:
        logger.error(f"Damage detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-batch", response_model=BatchDamageDetectionResult)
async def detect_batch_damage(
    request: BatchDamageDetectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BatchDamageDetectionResult:
    """Пакетне виявлення пошкоджень за кількома вібраційними сигналами."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in cnn_models:
        raise HTTPException(
            status_code=503,
            detail="CNN model not configured"
        )

    try:
        cnn = cnn_models[request.turbine_id]
        spec_shape = cnn.spectrogram_shape

        results = []
        class_counts = {"healthy": 0, "degraded": 0, "critical": 0}
        confidences = []

        for signal_data in request.signal_batches:
            signal = np.array(signal_data, dtype=np.float32)

            spectrogram = SpectrogramGenerator.create_spectrogram(
                signal,
                fs=request.fs,
                nperseg=spec_shape[1] // 2,
            )

            from PIL import Image
            pil_image = Image.fromarray((spectrogram * 255).astype(np.uint8))
            pil_image = pil_image.resize(spec_shape[::-1], Image.LANCZOS)
            spec_resized = np.array(pil_image) / 255.0

            prediction = cnn.predict(spec_resized)
            results.append(prediction)

            # Підраховуємо класи
            damage_class = prediction["class"]
            if damage_class in class_counts:
                class_counts[damage_class] += 1

            confidences.append(prediction["confidence"])

        avg_confidence = np.mean(confidences) if confidences else 0.0

        logger.info(
            f"[{request.turbine_id}] Batch detection: {len(request.signal_batches)} signals, "
            f"damaged={class_counts['degraded']+class_counts['critical']}, "
            f"avg_confidence={avg_confidence:.2%}"
        )

        return BatchDamageDetectionResult(
            turbine_id=request.turbine_id,
            total_signals=len(request.signal_batches),
            damaged_count=class_counts["degraded"] + class_counts["critical"],
            healthy_count=class_counts["healthy"],
            critical_count=class_counts["critical"],
            average_confidence=float(avg_confidence),
            results=results,
        )

    except Exception as e:
        logger.error(f"Batch detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train/{turbine_id}")
async def train_cnn(
    turbine_id: str,
    training_data: Dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Тренує модель CNN на розмічених спектрограмах (для active learning)."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in cnn_models:
        raise HTTPException(status_code=503, detail="CNN model not configured")

    try:
        # Цей ендпоінт потребує розмічених даних у training_data
        # Поки що просто вказуємо, що тренування ще не реалізоване
        logger.warning(f"CNN training requested for {turbine_id} but not yet implemented")

        return {
            "status": "not_implemented",
            "message": "CNN training requires labeled dataset preparation",
            "turbine_id": turbine_id,
        }

    except Exception as e:
        logger.error(f"CNN training error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
