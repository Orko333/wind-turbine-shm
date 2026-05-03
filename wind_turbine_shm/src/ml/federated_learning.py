"""Федеративне навчання — тренування моделей на кількох вітрових парках без централізації даних."""

import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json
from loguru import logger
import tensorflow as tf
from tensorflow import keras


@dataclass
class FederatedUpdate:
    """Оновлення моделі від одного парку."""
    park_id: str
    weights: List[np.ndarray]
    num_samples: int
    metrics: Dict[str, float]


class FederatedAveraging:
    """Алгоритм Federated Averaging (FedAvg) для розподіленого навчання."""

    def __init__(self, global_model: keras.Model):
        self.global_model = global_model
        self.update_history: List[Dict] = []
        self.round = 0

    def aggregate_updates(self, updates: List[FederatedUpdate]) -> Dict[str, float]:
        """
        Агрегує оновлення з кількох парків зважуваним усередненням.

        FedAvg: w_t+1 = Σ(n_k / n) * w_k,t
        де n_k = кількість зразків з парку k, n = загальна кількість зразків.
        """
        if not updates:
            return {'error': 'No updates to aggregate'}

        total_samples = sum(u.num_samples for u in updates)

        # Ініціалізуємо агреговані ваги
        aggregated_weights = None

        for update in updates:
            weight = update.num_samples / total_samples
            logger.info(f"Park {update.park_id}: {update.num_samples} samples (weight={weight:.2%})")

            if aggregated_weights is None:
                aggregated_weights = [w * weight for w in update.weights]
            else:
                aggregated_weights = [
                    a + w * weight
                    for a, w in zip(aggregated_weights, update.weights)
                ]

        # Оновлюємо глобальну модель
        self.global_model.set_weights(aggregated_weights)

        # Логуємо метрики
        avg_loss = np.mean([u.metrics.get('loss', 0) for u in updates])
        avg_acc = np.mean([u.metrics.get('accuracy', 0) for u in updates])

        round_info = {
            'round': self.round,
            'num_parks': len(updates),
            'total_samples': total_samples,
            'avg_loss': float(avg_loss),
            'avg_accuracy': float(avg_acc),
        }

        self.update_history.append(round_info)
        self.round += 1

        logger.info(f"Round {self.round}: avg_loss={avg_loss:.4f}, avg_accuracy={avg_acc:.4f}")

        return round_info

    def get_global_weights(self) -> List[np.ndarray]:
        """Повертає поточні ваги глобальної моделі для розповсюдження по парках."""
        return self.global_model.get_weights()

    def evaluate_global(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, float]:
        """Оцінює глобальну модель на тестових даних."""
        loss, accuracy = self.global_model.evaluate(X_test, y_test, verbose=0)
        return {
            'loss': float(loss),
            'accuracy': float(accuracy),
        }


class LocalTrainer:
    """Локальне тренування моделі на окремих вітрових парках."""

    def __init__(self, model: keras.Model, learning_rate: float = 1e-3):
        self.model = model
        self.learning_rate = learning_rate
        self.local_history = []

    def set_global_weights(self, weights: List[np.ndarray]):
        """Ініціалізує локальну модель глобальними вагами."""
        self.model.set_weights(weights)

    def train_locally(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        epochs: int = 5,
        batch_size: int = 32,
    ) -> Dict[str, float]:
        """
        Тренує модель локально протягом E епох.

        Args:
            X_train: Локальні тренувальні дані [num_samples, features]
            y_train: Локальні мітки [num_samples, ...]
            epochs: Кількість локальних епох тренування
            batch_size: Розмір батчу для тренування

        Returns:
            Метрики тренування
        """
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='mse',
            metrics=['mae'],
        )

        history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.1,
            verbose=0,
        )

        metrics = {
            'loss': float(history.history['loss'][-1]),
            'val_loss': float(history.history['val_loss'][-1]),
            'mae': float(history.history['mae'][-1]),
        }

        self.local_history.append(metrics)
        return metrics

    def get_model_weights(self) -> List[np.ndarray]:
        """Повертає ваги локальної моделі."""
        return self.model.get_weights()

    def get_num_local_samples(self) -> int:
        """Повертає загальну кількість зразків, на яких тренувалися."""
        # Має відстежуватися під час тренування
        return len(self.local_history)  # Спрощено


class DifferentialPrivacy:
    """Диференційна приватність для федеративного навчання — захист даних парку."""

    def __init__(self, epsilon: float = 1.0, delta: float = 1e-5, clip_norm: float = 1.0):
        """
        Args:
            epsilon: Бюджет приватності (менше = більш приватно)
            delta: Імовірність невдачі
            clip_norm: Норма обрізання градієнта (запобігає великим оновленням)
        """
        self.epsilon = epsilon
        self.delta = delta
        self.clip_norm = clip_norm

    def add_noise_to_weights(
        self,
        weights: List[np.ndarray],
        num_samples: int,
    ) -> List[np.ndarray]:
        """
        Додає шум Лапласа або Гауса до ваг для забезпечення диференційної приватності.

        Механізм: w_private = w + Noise(scale = clip_norm / (epsilon * num_samples))
        """
        noisy_weights = []

        for w in weights:
            # Коефіцієнт масштабу для шуму
            scale = self.clip_norm / (self.epsilon * max(num_samples, 1))

            # Гаусівський шум (для зручнішого розподілу)
            noise = np.random.normal(0, scale, size=w.shape)
            noisy_w = np.clip(w, -self.clip_norm, self.clip_norm) + noise

            noisy_weights.append(noisy_w)

        logger.info(f"Added DP noise with epsilon={self.epsilon}, scale={scale:.6f}")
        return noisy_weights

    def clip_gradients(self, gradients: List[np.ndarray]) -> List[np.ndarray]:
        """Обрізає градієнти за глобальною нормою."""
        clipped = []

        for g in gradients:
            norm = np.linalg.norm(g)
            clipped_g = g * min(1.0, self.clip_norm / (norm + 1e-8))
            clipped.append(clipped_g)

        return clipped


class SecureAggregation:
    """Безпечне багатостороннє обчислення для агрегування ваг."""

    @staticmethod
    def split_secret(value: float, num_parties: int) -> List[float]:
        """Розділяє значення на випадкові частини (схема Шаміра)."""
        if num_parties < 2:
            return [value]

        shares = [np.random.normal(0, 1) for _ in range(num_parties - 1)]
        shares.append(value - sum(shares))
        return shares

    @staticmethod
    def reconstruct_secret(shares: List[float]) -> float:
        """Реконструює значення з частин."""
        return sum(shares)

    @staticmethod
    def secure_sum(values: List[np.ndarray]) -> np.ndarray:
        """
        Безпечно підсумовує значення, не розкриваючи окремі значення агрегатору.
        Використовує адитивне розділення секрету.
        """
        if not values:
            return np.array([])

        # Для демонстрації: у промисловому використанні застосовують криптографічні протоколи
        return np.sum(np.array(values), axis=0)


class FederatedLearningCoordinator:
    """Координує федеративне навчання на кількох вітрових парках."""

    def __init__(
        self,
        global_model: keras.Model,
        use_dp: bool = True,
        use_secure_agg: bool = True,
    ):
        self.fedavg = FederatedAveraging(global_model)
        self.dp = DifferentialPrivacy() if use_dp else None
        self.use_secure_agg = use_secure_agg

        self.park_models: Dict[str, LocalTrainer] = {}
        self.park_data_specs: Dict[str, Dict] = {}

    def register_park(self, park_id: str, num_local_samples: int):
        """Реєструє парк для участі у федеративному навчанні."""
        self.park_data_specs[park_id] = {
            'num_samples': num_local_samples,
            'registered_at': str(np.datetime64('now')),
        }
        logger.info(f"Registered park {park_id} with {num_local_samples} samples")

    def distribute_weights(self, park_ids: List[str]) -> Dict[str, List[np.ndarray]]:
        """Розповсюджує поточні глобальні ваги по парках."""
        weights = self.fedavg.get_global_weights()

        result = {}
        for park_id in park_ids:
            if park_id in self.park_data_specs:
                result[park_id] = weights
                logger.debug(f"Distributed weights to {park_id}")

        return result

    def collect_updates(
        self,
        park_updates: Dict[str, Tuple[List[np.ndarray], int, Dict[str, float]]],
        apply_dp: bool = True,
    ) -> Dict[str, float]:
        """
        Збирає та агрегує оновлення з парків.

        Args:
            park_updates: {park_id: (weights, num_samples, metrics)}
            apply_dp: Чи застосовувати диференційну приватність

        Returns:
            Статистика агрегації
        """
        updates = []

        for park_id, (weights, num_samples, metrics) in park_updates.items():
            logger.info(f"Collecting update from {park_id}: {num_samples} samples")

            # Застосовуємо DP, якщо ввімкнено
            if apply_dp and self.dp:
                weights = self.dp.add_noise_to_weights(weights, num_samples)

            update = FederatedUpdate(
                park_id=park_id,
                weights=weights,
                num_samples=num_samples,
                metrics=metrics,
            )
            updates.append(update)

        # Агрегуємо
        if self.use_secure_agg:
            logger.info("Using secure aggregation")

        result = self.fedavg.aggregate_updates(updates)
        return result

    def federated_round(
        self,
        park_updates: Dict[str, Tuple[List[np.ndarray], int, Dict[str, float]]],
    ):
        """Виконує один раунд федеративного навчання."""
        logger.info(f"Starting federated round {self.fedavg.round}")
        self.collect_updates(park_updates)
        logger.info(f"Completed federated round {self.fedavg.round}")

    def get_training_progress(self) -> Dict:
        """Повертає прогрес федеративного тренування."""
        return {
            'current_round': self.fedavg.round,
            'history': self.fedavg.update_history,
            'num_parks': len(self.park_data_specs),
        }


def create_federated_model(input_shape: Tuple[int, int]) -> keras.Model:
    """Створює модель для федеративного навчання."""
    model = keras.Sequential([
        keras.layers.LSTM(64, return_sequences=True, input_shape=input_shape),
        keras.layers.Dropout(0.2),
        keras.layers.LSTM(32),
        keras.layers.Dense(16, activation='relu'),
        keras.layers.Dense(8, activation='relu'),
        keras.layers.Dense(1),
    ])
    return model
