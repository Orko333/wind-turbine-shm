"""Роутер федеративного навчання — спільне тренування моделі на кількох парках."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import numpy as np
import json
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ..model_registry import get_model_registry
from ...ml.federated_learning import (
    FederatedLearningCoordinator,
    LocalTrainer,
    create_federated_model,
)

router = APIRouter(prefix="/federated", tags=["federated_learning"])

# Глобальний координатор федеративного навчання
federated_coordinator: Optional[FederatedLearningCoordinator] = None
local_trainers: Dict[str, LocalTrainer] = {}


class ParkRegistrationRequest(BaseModel):
    """Реєстрація вітропарку для федеративного навчання."""
    park_id: str = Field(..., description="Unique park identifier")
    num_local_samples: int = Field(..., ge=100, description="Number of samples available locally")


class LocalUpdateRequest(BaseModel):
    """Локальне оновлення моделі від парку."""
    park_id: str
    weights: List[List[float]] = Field(..., description="Serialized model weights")
    num_samples: int
    metrics: Dict[str, float] = Field(default_factory=dict)


class FederatedRoundRequest(BaseModel):
    """Виконує один раунд федеративного навчання."""
    participating_parks: List[str]
    apply_dp: bool = Field(True, description="Apply differential privacy")


class GlobalWeightsResponse(BaseModel):
    """Глобальні ваги моделі для розповсюдження."""
    round: int
    num_parameters: int
    weights_hash: str


class FederatedStatusResponse(BaseModel):
    """Статус федеративного навчання."""
    current_round: int
    num_parks: int
    total_samples: int
    avg_loss: Optional[float]
    training_progress: Dict


@router.post("/initialize")
async def initialize_federated(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ініціалізує координатор федеративного навчання."""
    global federated_coordinator

    try:
        # Створюємо глобальну модель
        global_model = create_federated_model(input_shape=(24, 8))

        # Ініціалізуємо координатор з механізмами приватності та безпеки
        federated_coordinator = FederatedLearningCoordinator(
            global_model=global_model,
            use_dp=True,
            use_secure_agg=True,
        )

        logger.info("Federated Learning Coordinator initialized")

        return {
            "status": "initialized",
            "message": "Federated learning ready for multi-park training",
        }

    except Exception as e:
        logger.error(f"Initialization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parks/register")
async def register_park(
    request: ParkRegistrationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Реєструє вітропарк для участі у федеративному навчанні."""
    global federated_coordinator

    if not federated_coordinator:
        raise HTTPException(status_code=503, detail="Federated coordinator not initialized")

    try:
        federated_coordinator.register_park(
            park_id=request.park_id,
            num_local_samples=request.num_local_samples,
        )

        # Створюємо локального тренера для цього парку
        if request.park_id not in local_trainers:
            local_model = create_federated_model(input_shape=(24, 8))
            local_trainers[request.park_id] = LocalTrainer(local_model)

        logger.info(f"Park {request.park_id} registered with {request.num_local_samples} samples")

        return {
            "status": "registered",
            "park_id": request.park_id,
            "num_samples": request.num_local_samples,
        }

    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weights/{round_number}")
async def get_global_weights(
    round_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Завантажує поточні глобальні ваги моделі."""
    global federated_coordinator

    if not federated_coordinator:
        raise HTTPException(status_code=503, detail="Federated coordinator not initialized")

    try:
        weights = federated_coordinator.fedavg.get_global_weights()

        # Серіалізуємо ваги
        serialized = [w.tolist() if isinstance(w, np.ndarray) else w for w in weights]

        # Обчислюємо хеш для верифікації
        import hashlib
        weights_str = json.dumps(serialized, default=str)
        weights_hash = hashlib.sha256(weights_str.encode()).hexdigest()[:16]

        logger.info(f"Global weights distributed for round {round_number}")

        return {
            "round": round_number,
            "num_weight_matrices": len(weights),
            "weights_hash": weights_hash,
            "weights": serialized,
        }

    except Exception as e:
        logger.error(f"Weight retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/updates/submit")
async def submit_local_update(
    request: LocalUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Подає локальне оновлення моделі від парку."""
    global federated_coordinator

    if not federated_coordinator:
        raise HTTPException(status_code=503, detail="Federated coordinator not initialized")

    try:
        # Перетворюємо серіалізовані ваги назад у numpy-масиви
        weights = [np.array(w, dtype=np.float32) for w in request.weights]

        logger.info(
            f"Received update from {request.park_id}: "
            f"{request.num_samples} samples, loss={request.metrics.get('loss', 'N/A')}"
        )

        return {
            "status": "received",
            "park_id": request.park_id,
            "num_samples": request.num_samples,
        }

    except Exception as e:
        logger.error(f"Update submission error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/round/execute")
async def execute_federated_round(
    request: FederatedRoundRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Виконує один раунд федеративного навчання з парками-учасниками."""
    global federated_coordinator

    if not federated_coordinator:
        raise HTTPException(status_code=503, detail="Federated coordinator not initialized")

    try:
        logger.info(
            f"Starting federated round with parks: {request.participating_parks}"
        )

        # Імітуємо збір оновлень від парків-учасників
        # У промисловому використанні ці дані подавалися б самими парками
        park_updates = {}

        for park_id in request.participating_parks:
            if park_id not in local_trainers:
                logger.warning(f"Park {park_id} not registered, skipping")
                continue

            trainer = local_trainers[park_id]
            weights = trainer.get_model_weights()

            # Перетворюємо у формат, придатний для серіалізації
            weights_serialized = [w.tolist() if isinstance(w, np.ndarray) else w for w in weights]

            park_updates[park_id] = (
                [np.array(w, dtype=np.float32) for w in weights_serialized],
                1000,  # Імітована кількість зразків
                {"loss": 0.5, "accuracy": 0.8},
            )

        # Виконуємо раунд
        federated_coordinator.federated_round(park_updates)

        # Отримуємо прогрес
        progress = federated_coordinator.get_training_progress()

        logger.info(f"Federated round {progress['current_round']} completed")

        return {
            "status": "round_completed",
            "round": progress['current_round'],
            "num_parks_participated": len(park_updates),
            "progress": progress,
        }

    except Exception as e:
        logger.error(f"Round execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=FederatedStatusResponse)
async def get_federated_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FederatedStatusResponse:
    """Повертає статус федеративного навчання."""
    global federated_coordinator

    # Lazy-initialize the coordinator on first status request so dashboards
    # don't 503 before /federated/initialize has been called explicitly.
    if not federated_coordinator:
        try:
            global_model = create_federated_model(input_shape=(24, 8))
            federated_coordinator = FederatedLearningCoordinator(
                global_model=global_model,
                use_dp=True,
                use_secure_agg=True,
            )
            logger.info("Federated coordinator lazy-initialized for status query")
        except Exception as e:
            logger.error(f"Federated lazy-init failed: {e}")
            # Fall back to an idle response instead of 503 — the UI can
            # show "not yet started" instead of crashing.
            return FederatedStatusResponse(
                current_round=0,
                num_parks=0,
                total_samples=0,
                avg_loss=None,
                training_progress={"current_round": 0, "num_parks": 0, "history": []},
            )

    try:
        progress = federated_coordinator.get_training_progress()

        total_samples = sum(
            specs['num_samples']
            for specs in federated_coordinator.park_data_specs.values()
        )

        avg_loss = None
        if progress['history']:
            avg_loss = progress['history'][-1].get('avg_loss')

        return FederatedStatusResponse(
            current_round=progress['current_round'],
            num_parks=progress['num_parks'],
            total_samples=total_samples,
            avg_loss=avg_loss,
            training_progress=progress,
        )

    except Exception as e:
        logger.error(f"Status retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/privacy")
async def get_privacy_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Повертає метрики приватності для федеративного навчання."""
    global federated_coordinator

    if not federated_coordinator or not federated_coordinator.dp:
        return {"privacy_enabled": False}

    try:
        dp = federated_coordinator.dp

        return {
            "privacy_enabled": True,
            "epsilon": dp.epsilon,
            "delta": dp.delta,
            "clip_norm": dp.clip_norm,
            "mechanism": "Gaussian Differential Privacy",
            "info": "Individual park updates are differentially private and cannot be reversed to recover original data",
        }

    except Exception as e:
        logger.error(f"Privacy metrics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
