"""Моніторинг експлуатаційного модального аналізу (OMA) — відстеження власних частот."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...signal.oma import OperationalModalAnalyzer

router = APIRouter(prefix="/oma", tags=["oma"])

# Global OMA analyzers per turbine
oma_analyzers = {}


class ModalFrequencies(BaseModel):
    """Modal analysis results."""
    turbine_id: str
    natural_frequencies: List[float]  # [Hz]
    amplitudes: List[float]
    damping_ratios: List[float]
    frequency_shift: float  # [%]
    health_indicator: float  # [0-1]
    is_degraded: bool
    alert: str = None


class OMAConfig(BaseModel):
    """Configuration for OMA analyzer."""
    fs: float = 100.0  # Sampling frequency [Hz]
    baseline_frequencies: List[float] = None


@router.post("/configure/{turbine_id}")
async def configure_oma(
    turbine_id: str,
    config: OMAConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Configure OMA analyzer for turbine."""
    # Verify turbine ownership
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    # Створити analyzer
    analyzer = OperationalModalAnalyzer(
        fs=config.fs,
        baseline_freqs=config.baseline_frequencies,
    )

    oma_analyzers[turbine_id] = analyzer

    logger.info(
        f"OMA configured for {turbine_id}: "
        f"fs={config.fs} Hz, baseline={config.baseline_frequencies}"
    )

    return {
        "status": "configured",
        "turbine_id": turbine_id,
        "fs": config.fs,
        "baseline_frequencies": config.baseline_frequencies or "None",
    }


@router.post("/analyze/{turbine_id}", response_model=ModalFrequencies)
async def analyze_vibration(
    turbine_id: str,
    accel_signal: List[float] = Query(..., description="Acceleration time series [m/s²]"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ModalFrequencies:
    """Analyze vibration signal and extract natural frequencies."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    # Отримати or створити analyzer
    if turbine_id not in oma_analyzers:
        oma_analyzers[turbine_id] = OperationalModalAnalyzer()

    analyzer = oma_analyzers[turbine_id]

    # Convert to numpy array
    signal = np.array(accel_signal, dtype=np.float32)

    # Run analysis
    try:
        modal_data = analyzer.analyze(signal)

        # Generate alert if degraded
        alert = None
        if modal_data.is_degraded:
            alert = (
                f"⚠️  STRUCTURAL DAMAGE DETECTED: "
                f"Natural frequency dropped {modal_data.frequency_shift:.1f}% "
                f"({modal_data.natural_frequencies[0]:.2f} Hz). "
                f"Schedule inspection immediately."
            )
            logger.warning(f"[{turbine_id}] {alert}")

        return ModalFrequencies(
            turbine_id=turbine_id,
            natural_frequencies=modal_data.natural_frequencies,
            amplitudes=modal_data.amplitudes,
            damping_ratios=modal_data.damping_ratios,
            frequency_shift=modal_data.frequency_shift,
            health_indicator=modal_data.health_indicator,
            is_degraded=modal_data.is_degraded,
            alert=alert,
        )

    except Exception as e:
        logger.error(f"OMA analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


@router.post("/set-baseline/{turbine_id}")
async def set_baseline(
    turbine_id: str,
    accel_signal: List[float] = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Set baseline frequencies for healthy structure."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    # Отримати analyzer
    if turbine_id not in oma_analyzers:
        oma_analyzers[turbine_id] = OperationalModalAnalyzer()

    analyzer = oma_analyzers[turbine_id]

    # Встановити baseline
    signal = np.array(accel_signal, dtype=np.float32)
    analyzer.set_baseline(signal)

    logger.info(f"Baseline set for {turbine_id}: {analyzer.baseline_freqs}")

    return {
        "status": "baseline_set",
        "turbine_id": turbine_id,
        "baseline_frequencies_hz": analyzer.baseline_freqs,
    }


@router.get("/frequency-trend/{turbine_id}")
async def get_frequency_trend(
    turbine_id: str,
    n_points: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get trend of first natural frequency over time."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in oma_analyzers:
        return {
            "turbine_id": turbine_id,
            "frequency_trend": [],
            "message": "No analysis performed yet",
        }

    analyzer = oma_analyzers[turbine_id]
    trend = analyzer.get_frequency_trend(n_points)

    return {
        "turbine_id": turbine_id,
        "frequency_trend": trend,
        "baseline_frequency_hz": analyzer.baseline_freqs[0] if analyzer.baseline_freqs else None,
        "health_status": "Good" if not trend or trend[-1] > (analyzer.baseline_freqs[0] * 0.98 if analyzer.baseline_freqs else 0) else "Degraded",
    }
