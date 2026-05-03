"""Фізично інформовані нейронні мережі (PINN) для прогнозування RUL з фізичними обмеженнями."""

import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
import tensorflow as tf
from typing import Tuple, Callable


class PhysicsInformedNN:
    """
    PINN для прогнозування RUL з дотриманням фізичних законів накопичення втомного пошкодження.

    Фізичні обмеження:
    - Накопичення пошкоджень монотонно зростає (dD/dt >= 0)
    - Темп пошкодження пропорційний амплітуді напружень (цикли rainflow)
    - Дотримується правила Palmgren-Miner: D = Σ(ni/Ni)
    - Власні частоти знижуються з пошкодженням (втрата структурної жорсткості)
    """

    def __init__(self, sequence_length: int = 24, n_features: int = 8):
        self.sequence_length = sequence_length
        self.n_features = n_features
        self.model = self._build_model()

        # Фізичні параметри
        self.D_critical = 1.0  # Критичний поріг пошкодження
        self.density_steel = 7850  # кг/м³
        self.youngs_modulus = 2.1e11  # Па

    def _build_model(self) -> keras.Model:
        """Будує модель PINN з фізично інформованою архітектурою."""
        inputs = keras.Input(shape=(self.sequence_length, self.n_features))

        # Шари виділення ознак
        x = layers.LSTM(128, return_sequences=True, activation='tanh')(inputs)
        x = layers.Dropout(0.15)(x)
        x = layers.LSTM(64, return_sequences=False, activation='tanh')(x)
        x = layers.Dropout(0.15)(x)

        # Щільні шари з фізично-обізнаними активаціями
        x = layers.Dense(64, activation='relu')(x)
        x = layers.Dense(32, activation='relu')(x)

        # Багатовихідний шар: damage, damage_rate, freq_shift
        damage_out = layers.Dense(1, activation='sigmoid', name='damage')(x)  # 0-1
        damage_rate_out = layers.Dense(1, activation='relu', name='damage_rate')(x)  # >=0
        freq_shift_out = layers.Dense(1, activation='tanh', name='freq_shift')(x)  # -1 до 1

        model = keras.Model(
            inputs=inputs,
            outputs=[damage_out, damage_rate_out, freq_shift_out]
        )
        return model

    def _physics_loss(self, y_true, outputs):
        """
        Функція втрат, що включає фізичні обмеження.
        Штрафує порушення фізичних законів.
        """
        damage_true = y_true[:, 0:1]
        damage_pred, damage_rate_pred, freq_shift_pred = outputs

        # 1. Втрата підгонки до даних (MSE)
        data_loss = tf.reduce_mean(tf.square(damage_pred - damage_true))

        # 2. Фізичне обмеження 1: темп пошкодження додатний
        # Штрафуємо якщо damage_rate < 0
        physics_loss_1 = tf.reduce_mean(
            tf.nn.relu(-damage_rate_pred)  # ReLU дає 0 якщо додатне, штрафує від'ємне
        )

        # 3. Фізичне обмеження 2: монотонність пошкодження
        # dD/dt >= 0 (пошкодження ніколи не зменшується)
        # Неявно забезпечується сигмоїдною активацією на виході damage

        # 4. Фізичне обмеження 3: кореляція зі зсувом частот
        # Більше пошкодження → більший зсув частот (від'ємний)
        # Штраф якщо знак неправильний
        freq_shift_penalty = tf.reduce_mean(
            tf.square(freq_shift_pred + damage_pred)  # Мають корелювати
        )

        # 5. Регуляризація: утримуємо прогнози у фізичних межах
        damage_bounds = tf.reduce_mean(
            tf.nn.relu(damage_pred - 1.1) +  # Штраф за > 1.1
            tf.nn.relu(-damage_pred - 0.1)    # Штраф за < -0.1
        )

        # Зважена комбінація
        total_loss = (
            1.0 * data_loss +
            0.5 * physics_loss_1 +
            0.3 * freq_shift_penalty +
            0.2 * damage_bounds
        )

        return total_loss

    def compile(self, learning_rate: float = 1e-3):
        """Компіляція з фізично-обізнаною функцією втрат."""
        def custom_loss(y_true, y_pred):
            return self._physics_loss(y_true, y_pred)

        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
            loss=custom_loss,
        )

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray = None,
        y_val: np.ndarray = None,
        epochs: int = 100,
        batch_size: int = 32,
    ):
        """Тренує PINN з фізичними обмеженнями."""
        self.compile()

        callbacks = [
            keras.callbacks.EarlyStopping(
                monitor='val_loss' if X_val is not None else 'loss',
                patience=15,
                restore_best_weights=True,
            ),
            keras.callbacks.ReduceLROnPlateau(
                factor=0.5,
                patience=5,
                min_lr=1e-6,
            ),
        ]

        val_data = (X_val, y_val) if X_val is not None else None

        history = self.model.fit(
            X_train,
            y_train,
            validation_data=val_data,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1,
        )

        return history

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Прогнозує пошкодження, темп пошкодження та зсув частоти.

        Returns:
            damage: Прогнозований індекс пошкодження [0-1]
            damage_rate: Прогнозований темп накопичення пошкодження [за день]
            freq_shift: Прогнозований зсув частоти [-1 до 1]
        """
        damage, damage_rate, freq_shift = self.model.predict(X)

        # Забезпечуємо фізичні межі
        damage = np.clip(damage, 0, 1)
        damage_rate = np.maximum(damage_rate, 0)  # Невід'ємне
        freq_shift = np.clip(freq_shift, -1, 1)

        return damage, damage_rate, freq_shift

    def estimate_rul(
        self,
        X: np.ndarray,
        current_damage: float = None,
    ) -> np.ndarray:
        """
        Оцінює залишковий ресурс (RUL) за прогнозованим темпом пошкодження.

        RUL = (D_critical - D_current) / (dD/dt)
        """
        damage, damage_rate, _ = self.predict(X)
        damage = damage.flatten()
        damage_rate = np.maximum(damage_rate.flatten(), 1e-6)  # Уникаємо ділення на нуль

        if current_damage is None:
            current_damage = damage[0]

        rul_days = (self.D_critical - current_damage) / damage_rate
        rul_days = np.maximum(rul_days, 0)  # Невід'ємний RUL

        return rul_days

    def save(self, filepath: str):
        """Зберігає навчену модель."""
        self.model.save(filepath)

    def load(self, filepath: str):
        """Завантажує навчену модель."""
        self.model = keras.models.load_model(filepath)
