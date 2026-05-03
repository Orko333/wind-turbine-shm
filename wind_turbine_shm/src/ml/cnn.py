"""Згорткові нейронні мережі (CNN) для розпізнавання патернів на віброспектрограмах."""

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from typing import Tuple, Optional
from loguru import logger
import io
from PIL import Image


class SpectrogramCNN:
    """
    CNN для виявлення патернів структурних пошкоджень на віброспектрограмах.

    Виявляє:
    - Розвиток втомних тріщин (зміни у високочастотному вмісті)
    - Дисбаланс ротора (підвищені 1P та гармоніки)
    - Перекоси (збільшений широкосмуговий шум)
    - Деградацію підшипників (імпульсні піки на спектрограмі)

    Вхід: частотно-часова спектрограма (time x frequency x 1)
    Вихід: класифікація пошкоджень (норма/деградація) + впевненість
    """

    def __init__(
        self,
        spectrogram_shape: Tuple[int, int] = (128, 256),  # (time_bins, freq_bins)
        num_classes: int = 3,  # [healthy, degraded, critical]
    ):
        """
        Args:
            spectrogram_shape: (time_bins, frequency_bins) для вхідних спектрограм
            num_classes: Кількість класів пошкоджень для класифікації
        """
        self.spectrogram_shape = spectrogram_shape
        self.num_classes = num_classes
        self.model = None
        self.is_trained = False

    def build_model(self) -> keras.Model:
        """Будує архітектуру CNN, оптимізовану для виявлення пошкоджень на спектрограмах."""
        inputs = keras.Input(shape=(*self.spectrogram_shape, 1))

        # Блок 1: виділення низькорівневих ознак (краї, патерни)
        x = layers.Conv2D(32, (3, 3), activation="relu", padding="same")(inputs)
        x = layers.BatchNormalization()(x)
        x = layers.Conv2D(32, (3, 3), activation="relu", padding="same")(x)
        x = layers.MaxPooling2D((2, 2))(x)
        x = layers.Dropout(0.25)(x)

        # Блок 2: виявлення патернів у частотній області
        x = layers.Conv2D(64, (3, 3), activation="relu", padding="same")(x)
        x = layers.BatchNormalization()(x)
        x = layers.Conv2D(64, (3, 3), activation="relu", padding="same")(x)
        x = layers.MaxPooling2D((2, 2))(x)
        x = layers.Dropout(0.25)(x)

        # Блок 3: виявлення часових патернів (як патерни змінюються в часі)
        x = layers.Conv2D(128, (3, 3), activation="relu", padding="same")(x)
        x = layers.BatchNormalization()(x)
        x = layers.Conv2D(128, (3, 3), activation="relu", padding="same")(x)
        x = layers.MaxPooling2D((2, 2))(x)
        x = layers.Dropout(0.25)(x)

        # Глобальне пулінг та класифікація
        x = layers.GlobalAveragePooling2D()(x)

        # Щільні шари з регуляризацією
        x = layers.Dense(256, activation="relu")(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.5)(x)

        x = layers.Dense(128, activation="relu")(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.5)(x)

        # Вихідний шар: softmax для багатокласової класифікації
        outputs = layers.Dense(self.num_classes, activation="softmax")(x)

        model = keras.Model(inputs=inputs, outputs=outputs)

        # Компілюємо з categorical crossentropy
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=1e-3),
            loss="categorical_crossentropy",
            metrics=["accuracy", keras.metrics.Precision(), keras.metrics.Recall()],
        )

        self.model = model
        logger.info(f"CNN model built: {self.spectrogram_shape} input, {self.num_classes} classes")
        return model

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        epochs: int = 50,
        batch_size: int = 32,
    ) -> dict:
        """
        Навчає CNN на наборі спектрограм.

        Args:
            X_train: Спектрограми для тренування форми (N, H, W, 1), нормалізовані [0, 1]
            y_train: Мітки в one-hot форматі форми (N, num_classes)
            X_val: Валідаційні спектрограми (опційно)
            y_val: Валідаційні мітки (опційно)
            epochs: Кількість епох навчання
            batch_size: Розмір батчу для навчання

        Returns:
            Словник історії навчання
        """
        if self.model is None:
            self.build_model()

        # Готуємо валідаційні дані
        validation_data = None
        if X_val is not None and y_val is not None:
            validation_data = (X_val, y_val)

        # Колбек ранньої зупинки
        early_stop = keras.callbacks.EarlyStopping(
            monitor="val_loss" if validation_data else "loss",
            patience=10,
            restore_best_weights=True,
        )

        # Навчаємо
        history = self.model.fit(
            X_train,
            y_train,
            validation_data=validation_data,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[early_stop],
            verbose=1,
        )

        self.is_trained = True
        logger.info("CNN training completed")
        return history.history

    def predict(
        self, spectrogram: np.ndarray, threshold: float = 0.7
    ) -> dict:
        """
        Класифікує стан пошкодження за однією спектрограмою.

        Args:
            spectrogram: Вхідна спектрограма (H, W), нормалізована [0, 1]
            threshold: Поріг впевненості для тривоги

        Returns:
            {
                'class': str (healthy/degraded/critical),
                'confidence': float [0-1],
                'probabilities': dict з усіма ймовірностями класів,
                'alert': bool,
            }
        """
        if self.model is None or not self.is_trained:
            logger.warning("CNN not trained — returning default prediction")
            return {
                "class": "unknown",
                "confidence": 0.0,
                "probabilities": {},
                "alert": False,
            }

        # Забезпечуємо коректну форму
        if len(spectrogram.shape) == 2:
            spectrogram = np.expand_dims(spectrogram, axis=-1)
        if len(spectrogram.shape) == 3:
            spectrogram = np.expand_dims(spectrogram, axis=0)

        # Прогноз
        predictions = self.model.predict(spectrogram, verbose=0)[0]

        # Зіставляємо з назвами класів
        class_names = ["healthy", "degraded", "critical"]
        if self.num_classes > 3:
            class_names = [f"class_{i}" for i in range(self.num_classes)]

        class_idx = np.argmax(predictions)
        confidence = float(predictions[class_idx])

        # Тривога, якщо degraded/critical або низька впевненість на healthy
        alert = (
            class_idx > 0 and confidence > threshold
        ) or (class_idx == 0 and confidence < threshold)

        return {
            "class": class_names[class_idx],
            "confidence": confidence,
            "probabilities": {
                class_names[i]: float(predictions[i])
                for i in range(self.num_classes)
            },
            "alert": alert,
        }

    def predict_batch(
        self, spectrograms: np.ndarray
    ) -> list:
        """
        Класифікує декілька спектрограм одночасно.

        Args:
            spectrograms: Батч спектрограм (N, H, W) або (N, H, W, 1)

        Returns:
            Список словників прогнозу
        """
        if len(spectrograms.shape) == 3:
            spectrograms = np.expand_dims(spectrograms, axis=-1)

        predictions = self.model.predict(spectrograms, verbose=0)

        class_names = ["healthy", "degraded", "critical"]
        if self.num_classes > 3:
            class_names = [f"class_{i}" for i in range(self.num_classes)]

        results = []
        for pred in predictions:
            class_idx = np.argmax(pred)
            confidence = float(pred[class_idx])

            results.append({
                "class": class_names[class_idx],
                "confidence": confidence,
                "probabilities": {
                    class_names[i]: float(pred[i])
                    for i in range(self.num_classes)
                },
            })

        return results

    def save(self, filepath: str):
        """Зберігає навчену модель на диск."""
        if self.model is None:
            logger.error("No model to save")
            return
        self.model.save(filepath)
        logger.info(f"CNN model saved to {filepath}")

    def load(self, filepath: str):
        """Завантажує навчену модель з диску."""
        self.model = keras.models.load_model(filepath)
        self.is_trained = True
        logger.info(f"CNN model loaded from {filepath}")


class SpectrogramGenerator:
    """Генерація спектрограм з часових сигналів вібрації для входу в CNN."""

    @staticmethod
    def create_spectrogram(
        signal: np.ndarray,
        fs: float = 100.0,
        nperseg: int = 256,
        noverlap: int = None,
    ) -> np.ndarray:
        """
        Створює спектрограму з сигналу прискорення.

        Args:
            signal: Часовий сигнал прискорення [м/с²]
            fs: Частота дискретизації [Гц]
            nperseg: Довжина кожного сегмента для STFT
            noverlap: Перекриття між сегментами (за замовчуванням: nperseg//2)

        Returns:
            Масив спектрограми (freq_bins, time_bins), нормалізований [0, 1]
        """
        from scipy.signal import spectrogram as scipy_spectrogram

        if noverlap is None:
            noverlap = nperseg // 2

        # Обчислюємо спектрограму
        frequencies, times, Sxx = scipy_spectrogram(
            signal,
            fs=fs,
            nperseg=nperseg,
            noverlap=noverlap,
            window="hann",
        )

        # Логарифмічна шкала потужності (дБ)
        Sxx_db = 10 * np.log10(Sxx + 1e-10)

        # Нормалізуємо до [0, 1]
        Sxx_norm = (Sxx_db - Sxx_db.min()) / (Sxx_db.max() - Sxx_db.min() + 1e-10)

        # Транспонуємо до (time, freq) для CNN
        spectrogram = Sxx_norm.T

        return spectrogram

    @staticmethod
    def create_batch_spectrograms(
        signals: list,
        target_shape: Tuple[int, int] = (128, 256),
        **kwargs
    ) -> np.ndarray:
        """
        Створює батч спектрограм зі зміною розміру до однакової форми.

        Args:
            signals: Список часових сигналів
            target_shape: Цільова форма спектрограми (time_bins, freq_bins)
            **kwargs: Аргументи для create_spectrogram

        Returns:
            Масив батчу (N, time_bins, freq_bins, 1)
        """
        spectrograms = []
        for sig in signals:
            spec = SpectrogramGenerator.create_spectrogram(sig, **kwargs)

            # Зміна розміру до цільової форми
            pil_image = Image.fromarray((spec * 255).astype(np.uint8))
            pil_image = pil_image.resize(target_shape[::-1], Image.LANCZOS)
            spec_resized = np.array(pil_image) / 255.0

            spectrograms.append(spec_resized)

        # Стек і додаємо канал
        batch = np.stack(spectrograms, axis=0)
        batch = np.expand_dims(batch, axis=-1)

        return batch
