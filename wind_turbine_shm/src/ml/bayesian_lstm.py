"""Байєсівський LSTM для імовірнісних прогнозів RUL (Remaining Useful Life — залишкового ресурсу)."""

import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
import tensorflow as tf
from typing import Tuple


class BayesianLSTM:
    """
    LSTM з байєсівською оцінкою невизначеності.

    Замість точкових прогнозів видає середнє та стандартне відхилення розподілу RUL.
    Корисно для прийняття рішень з урахуванням ризику: вище std означає більшу невизначеність,
    тому варто планувати профілактичне обслуговування раніше.
    """

    def __init__(self, sequence_length: int = 24, n_features: int = 8):
        self.sequence_length = sequence_length
        self.n_features = n_features
        self.model = self._build_model()

    def _build_model(self) -> keras.Model:
        """Будує модель Bayesian LSTM з оцінкою невизначеності."""
        inputs = keras.Input(shape=(self.sequence_length, self.n_features))

        # Двонаправлений LSTM з dropout для оцінки невизначеності
        x = layers.Bidirectional(
            layers.LSTM(64, return_sequences=True, dropout=0.2)
        )(inputs)
        x = layers.Bidirectional(
            layers.LSTM(32, return_sequences=False, dropout=0.2)
        )(x)

        # Щільні шари
        x = layers.Dense(32, activation="relu")(x)
        x = layers.Dropout(0.2)(x)
        x = layers.Dense(16, activation="relu")(x)

        # Вихідний шар: прогнозує середнє та логарифм дисперсії RUL
        mu = layers.Dense(1, name="rul_mean")(x)  # Середнє RUL
        log_var = layers.Dense(1, name="rul_logvar")(x)  # Логарифм дисперсії

        model = keras.Model(inputs=inputs, outputs=[mu, log_var])
        return model

    def _loss_fn(self, y_true, outputs):
        """Байєсівська функція втрат: поєднує MSE з KL-дивергенцією."""
        mu, log_var = outputs
        sigma = tf.sqrt(tf.exp(log_var))

        # Від'ємна логарифмічна правдоподібність
        nll = 0.5 * tf.reduce_mean(
            tf.math.squared_difference(y_true, mu) / tf.exp(log_var) + log_var
        )

        # KL-дивергенція (регуляризація)
        kl = 0.5 * tf.reduce_mean(tf.exp(log_var) + tf.square(mu) - 1 - log_var)

        return nll + 0.1 * kl

    def compile(self, learning_rate: float = 1e-3):
        """Компілює модель з користувацькою функцією втрат."""

        def custom_loss(y_true, y_pred):
            return self._loss_fn(y_true, y_pred)

        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
            loss=custom_loss,
            metrics=["mae"],
        )

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray = None,
        y_val: np.ndarray = None,
        epochs: int = 50,
        batch_size: int = 32,
        verbose: int = 1,
    ):
        """Навчає Bayesian LSTM."""
        self.compile()

        callbacks = [
            keras.callbacks.EarlyStopping(
                monitor="val_loss" if X_val is not None else "loss",
                patience=10,
                restore_best_weights=True,
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss" if X_val is not None else "loss",
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
            verbose=verbose,
        )

        return history

    def predict_with_uncertainty(
        self, X: np.ndarray, n_samples: int = 100
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Прогнозує RUL з кількісною оцінкою невизначеності.

        Returns:
            rul_mean: Точкова оцінка RUL [днів]
            rul_std: Оцінене стандартне відхилення (довірчий інтервал)
        """
        mu_pred, log_var_pred = self.model.predict(X)

        rul_mean = mu_pred.flatten()
        rul_std = np.sqrt(np.exp(log_var_pred.flatten()))

        return rul_mean, rul_std

    def get_confidence_interval(
        self, X: np.ndarray, confidence: float = 0.95
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Повертає довірчі інтервали для RUL.

        Args:
            X: Вхідна послідовність
            confidence: Рівень довіри (0.95 = 95%)

        Returns:
            lower_bound: Нижня 95% межа довіри
            upper_bound: Верхня 95% межа довіри
        """
        rul_mean, rul_std = self.predict_with_uncertainty(X)

        # 1.96 — 95% критичне значення для нормального розподілу
        z_score = {
            0.68: 1.0,  # ±1σ
            0.95: 1.96,  # ±2σ
            0.99: 2.576,  # ±3σ
        }.get(confidence, 1.96)

        lower = rul_mean - z_score * rul_std
        upper = rul_mean + z_score * rul_std

        return np.maximum(lower, 0), upper

    def save(self, filepath: str):
        """Зберігає навчену модель."""
        self.model.save(filepath)

    def load(self, filepath: str):
        """Завантажує навчену модель."""
        self.model = keras.models.load_model(filepath)
