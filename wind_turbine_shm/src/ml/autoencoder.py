"""
Згортковий автокодер для несупервізованого виявлення аномалій у
сигналах вібрації башти вітрової турбіни.

Архітектура (1-D згорткова):
  Кодер: Conv1d → BatchNorm → ReLU → MaxPool (×3 блоки)
  Вузьке місце: повнозв'язний латентний простір (розмірність=32)
  Декодер: ConvTranspose1d → BatchNorm → ReLU (×3 блоки) → Sigmoid

Оцінка аномальності = середньоквадратична похибка реконструкції (MSE) на вхідному вікні.

Обґрунтування несупервізованого підходу:
  - Розмічені дані про несправності вкрай рідкісні в реальних вітрових турбінах.
  - Автокодер навчає розподіл «здорових» шаблонів вібрації
    на безвідмовних навчальних даних.
  - Будь-який сигнал, що погано реконструюється (високий MSE), позначається
    як аномальний — що свідчить про можливе структурне пошкодження або відмову датчика.

Джерела:
  Principi et al. (2019). Unsupervised Electric Motor Fault Detection via CNN.
  Nguyen et al. (2021). Deep learning for vibration-based damage detection.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from pathlib import Path
from typing import Optional, Tuple
from loguru import logger


class ConvEncoder(nn.Module):
    """
    1-D згортковий кодер: відображає вікно сигналу на латентний вектор.

    Форма входу : (batch, 1, signal_length)
    Форма виходу: (batch, latent_dim)
    """

    def __init__(self, signal_length: int = 1000, latent_dim: int = 32) -> None:
        super().__init__()
        self.latent_dim = latent_dim

        self.conv_blocks = nn.Sequential(
            # Блок 1: signal_length → signal_length/2
            nn.Conv1d(1, 16, kernel_size=7, padding=3),
            nn.BatchNorm1d(16),
            nn.ReLU(),
            nn.MaxPool1d(2),
            # Блок 2: /2 → /4
            nn.Conv1d(16, 32, kernel_size=5, padding=2),
            nn.BatchNorm1d(32),
            nn.ReLU(),
            nn.MaxPool1d(2),
            # Блок 3: /4 → /8
            nn.Conv1d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.MaxPool1d(2),
        )

        # Розмір після вирівнювання: 3 шари MaxPool1d(2) вдвічі зменшують довжину;
        # шари Conv1d зберігають довжину завдяки симетричному доповненню.
        self._flat_size = 64 * (signal_length // 2 // 2 // 2)

        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(self._flat_size, 128),
            nn.ReLU(),
            nn.Linear(128, latent_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.conv_blocks(x)
        return self.fc(h)


class ConvDecoder(nn.Module):
    """
    Транспозитно-згортковий декодер: відновлює сигнал із латентного вектора.

    Форма входу : (batch, latent_dim)
    Форма виходу: (batch, 1, signal_length)
    """

    def __init__(self, signal_length: int = 1000, latent_dim: int = 32, flat_size: int = 8000) -> None:
        super().__init__()
        self.signal_length = signal_length
        reduced_len = signal_length // 8

        self.fc = nn.Sequential(
            nn.Linear(latent_dim, 128),
            nn.ReLU(),
            nn.Linear(128, flat_size),
            nn.ReLU(),
        )
        self._flat_size = flat_size
        self._reduced_len = reduced_len
        self._channels = flat_size // reduced_len if reduced_len > 0 else 64

        self.deconv_blocks = nn.Sequential(
            # Збільшення масштабу ×8 у 3 кроки
            nn.ConvTranspose1d(self._channels, 32, kernel_size=4, stride=2, padding=1),
            nn.BatchNorm1d(32),
            nn.ReLU(),
            nn.ConvTranspose1d(32, 16, kernel_size=4, stride=2, padding=1),
            nn.BatchNorm1d(16),
            nn.ReLU(),
            nn.ConvTranspose1d(16, 1, kernel_size=4, stride=2, padding=1),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        h = self.fc(z)
        batch = h.size(0)
        h = h.view(batch, self._channels, self._reduced_len)
        out = self.deconv_blocks(h)
        # Обрізати або доповнити до точної довжини signal_length
        out = out[:, :, : self.signal_length]
        if out.shape[-1] < self.signal_length:
            pad = self.signal_length - out.shape[-1]
            out = torch.nn.functional.pad(out, (0, pad))
        return out


class ConvAutoencoder(nn.Module):
    """Повний згортковий автокодер (кодер + декодер)."""

    def __init__(self, signal_length: int = 1000, latent_dim: int = 32) -> None:
        super().__init__()
        self.encoder = ConvEncoder(signal_length, latent_dim)
        flat_size = self.encoder._flat_size
        self.decoder = ConvDecoder(signal_length, latent_dim, flat_size)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Повертає (відновлений_сигнал, латентний_вектор)."""
        z = self.encoder(x)
        x_hat = self.decoder(z)
        return x_hat, z


class AnomalyDetector:
    """
    Високорівнева обгортка для навчання автокодера та виявлення аномалій.

    Навчання: використовує лише «здорові» (з низьким пошкодженням) вікна сигналів.
    Інференс: похибка реконструкції > поріг → прапор аномалії.

    Поріг встановлюється на рівні (середнє + k*стд) похибок реконструкції
    на здоровій навчальній вибірці (за замовчуванням k=3.0 — правило 3-сигма).

    Використання
    -----
    >>> detector = AnomalyDetector(signal_length=1000)
    >>> detector.fit(X_healthy_train, X_healthy_val, epochs=50)
    >>> scores = detector.anomaly_scores(X_test)
    >>> flags = detector.detect(X_test)  # булів масив
    """

    def __init__(
        self,
        signal_length: int = 1000,
        latent_dim: int = 32,
        lr: float = 1e-3,
        batch_size: int = 32,
        threshold_sigma: float = 3.0,
        device: Optional[str] = None,
    ) -> None:
        self.signal_length = signal_length
        self.latent_dim = latent_dim
        self.batch_size = batch_size
        self.threshold_sigma = threshold_sigma

        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        self.model = ConvAutoencoder(signal_length, latent_dim).to(self.device)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.criterion = nn.MSELoss()

        self._threshold: Optional[float] = None
        self._train_losses: list[float] = []

    # ------------------------------------------------------------------ #
    #  Навчання                                                           #
    # ------------------------------------------------------------------ #

    def fit(
        self,
        X_healthy_train: np.ndarray,
        X_healthy_val: np.ndarray,
        epochs: int = 80,
        patience: int = 10,
        checkpoint_path: str = "models/checkpoints/autoencoder_best.pt",
    ) -> list[float]:
        """
        Навчити автокодер лише на здорових вікнах сигналів.

        X_healthy_train : масив (N, signal_length) — вікна без несправностей.
        """
        train_loader = self._make_loader(X_healthy_train, shuffle=True)
        val_loader = self._make_loader(X_healthy_val, shuffle=False)

        best_val = float("inf")
        no_improve = 0
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(self.optimizer, patience=5, factor=0.5)

        for epoch in range(1, epochs + 1):
            train_loss = self._train_epoch(train_loader)
            val_loss = self._eval_epoch(val_loader)
            scheduler.step(val_loss)
            self._train_losses.append(train_loss)

            if val_loss < best_val:
                best_val = val_loss
                Path(checkpoint_path).parent.mkdir(parents=True, exist_ok=True)
                torch.save(self.model.state_dict(), checkpoint_path)
                no_improve = 0
            else:
                no_improve += 1

            if epoch % 10 == 0:
                logger.info(f"АЕ Епоха {epoch:3d} | train={train_loss:.6f} | val={val_loss:.6f}")

            if no_improve >= patience:
                logger.info(f"Рання зупинка АЕ на епосі {epoch}.")
                break

        self.model.load_state_dict(torch.load(checkpoint_path, map_location=self.device))

        # Калібрування порогу на здоровій навчальній вибірці
        train_scores = self.anomaly_scores(X_healthy_train)
        self._threshold = float(train_scores.mean() + self.threshold_sigma * train_scores.std())
        logger.info(f"Поріг аномальності встановлено: {self._threshold:.6f}")
        return self._train_losses

    def _train_epoch(self, loader: DataLoader) -> float:
        self.model.train()
        total = 0.0
        for (X_batch,) in loader:
            X_batch = X_batch.to(self.device)
            self.optimizer.zero_grad()
            x_hat, _ = self.model(X_batch)
            loss = self.criterion(x_hat, X_batch)
            loss.backward()
            self.optimizer.step()
            total += loss.item() * len(X_batch)
        return total / len(loader.dataset)

    @torch.no_grad()
    def _eval_epoch(self, loader: DataLoader) -> float:
        self.model.eval()
        total = 0.0
        for (X_batch,) in loader:
            X_batch = X_batch.to(self.device)
            x_hat, _ = self.model(X_batch)
            loss = self.criterion(x_hat, X_batch)
            total += loss.item() * len(X_batch)
        return total / len(loader.dataset)

    # ------------------------------------------------------------------ #
    #  Інференс                                                           #
    # ------------------------------------------------------------------ #

    @torch.no_grad()
    def anomaly_scores(self, X: np.ndarray) -> np.ndarray:
        """
        Обчислити похибку реконструкції (MSE) для кожного зразка.

        Вища оцінка → більша аномальність.
        """
        self.model.eval()
        loader = self._make_loader(X, shuffle=False)
        scores = []
        for (X_batch,) in loader:
            X_batch = X_batch.to(self.device)
            x_hat, _ = self.model(X_batch)
            mse = ((x_hat - X_batch) ** 2).mean(dim=(1, 2))
            scores.append(mse.cpu().numpy())
        return np.concatenate(scores)

    def detect(self, X: np.ndarray) -> np.ndarray:
        """
        Повернути булів масив прапорів аномалій.
        True = аномалія (похибка реконструкції > поріг).
        """
        if self._threshold is None:
            raise RuntimeError("Модель не навчена або поріг не відкалібровано.")
        return self.anomaly_scores(X) > self._threshold

    @torch.no_grad()
    def get_latent(self, X: np.ndarray) -> np.ndarray:
        """Витягнути латентні представлення для візуалізації (t-SNE, UMAP)."""
        self.model.eval()
        loader = self._make_loader(X, shuffle=False)
        latents = []
        for (X_batch,) in loader:
            X_batch = X_batch.to(self.device)
            z = self.model.encoder(X_batch)
            latents.append(z.cpu().numpy())
        return np.vstack(latents)

    # ------------------------------------------------------------------ #
    #  Збереження та завантаження                                         #
    # ------------------------------------------------------------------ #

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "model_state": self.model.state_dict(),
                "threshold": self._threshold,
                "config": {
                    "signal_length": self.signal_length,
                    "latent_dim": self.latent_dim,
                },
            },
            path,
        )
        logger.info(f"AnomalyDetector збережено до {path}")

    @classmethod
    def load(cls, path: str) -> "AnomalyDetector":
        ckpt = torch.load(path, map_location="cpu")

        # Новий формат: dict із model_state, threshold, config.
        if isinstance(ckpt, dict) and "model_state" in ckpt:
            cfg = ckpt.get("config", {})
            signal_length = int(cfg.get("signal_length", 1000))
            latent_dim = int(cfg.get("latent_dim", 32))
            obj = cls(signal_length=signal_length, latent_dim=latent_dim)
            obj.model.load_state_dict(ckpt["model_state"])
            obj._threshold = ckpt.get("threshold", 0.1)
            return obj

        # Legacy формат: збережено лише state_dict без метаданих.
        if isinstance(ckpt, dict):
            obj = cls(signal_length=1000, latent_dim=32)
            obj.model.load_state_dict(ckpt)
            obj._threshold = 0.1
            logger.warning(
                "Завантажено legacy Autoencoder checkpoint без config/threshold; "
                "використано signal_length=1000, latent_dim=32, threshold=0.1."
            )
            return obj

        raise ValueError(f"Непідтримуваний формат checkpoint для autoencoder: {type(ckpt)}")

    def _make_loader(self, X: np.ndarray, shuffle: bool = False) -> DataLoader:
        # Форма: (N, 1, signal_length)
        X_t = torch.tensor(X, dtype=torch.float32)
        if X_t.ndim == 2:
            X_t = X_t.unsqueeze(1)
        ds = TensorDataset(X_t)
        return DataLoader(ds, batch_size=self.batch_size, shuffle=shuffle, num_workers=0)
