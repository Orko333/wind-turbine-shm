"""
LSTM-предиктор залишкового ресурсу (RUL) башти вітрової турбіни.

Архітектура: Стекований двонаправлений LSTM з механізмом уваги.

Вхід  : (batch, seq_len=24, n_features=8) — 24 послідовних 10-хв вікна SCADA.
Вихід : (batch, 1) — прогнозований індекс пошкодження D на наступному кроці.

Навчання використовує:
  - Втрату Хубера (стійка до викидів пошкоджень від штормових подій).
  - Adam із розкладом косинусного відпалу LR.
  - Відсікання градієнтів (max_norm=1.0) для запобігання вибуху градієнтів.
  - Ранню зупинку на основі валідаційного RMSE.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from typing import Optional, Tuple
from pathlib import Path
from loguru import logger


class LSTMTowerModel(nn.Module):
    """
    Двонаправлений LSTM із часовою увагою для прогнозування індексу пошкодження.

    Модель навчається відображати 24-годинні вікна SCADA-даних на
    кумулятивний індекс пошкодження наступного кроку, фіксуючи далекосяжні
    залежності в турбулентності та історії навантажень.
    """

    def __init__(
        self,
        input_size: int = 8,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.25,
        bidirectional: bool = True,
    ) -> None:
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.bidirectional = bidirectional
        self.directions = 2 if bidirectional else 1

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=bidirectional,
        )

        # Часова увага: навчає, які часові кроки найбільш важливі для RUL
        self.attention = nn.Sequential(
            nn.Linear(hidden_size * self.directions, 64),
            nn.Tanh(),
            nn.Linear(64, 1),
        )

        # Регресійна голова
        self.regressor = nn.Sequential(
            nn.Linear(hidden_size * self.directions, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Прямий прохід.

        Параметри
        ----------
        x : (batch, seq_len, input_size)

        Повертає
        -------
        output : (batch, 1) — прогнозований індекс пошкодження
        attn_weights : (batch, seq_len) — ваги уваги для інтерпретованості
        """
        # LSTM: (batch, seq_len, hidden*directions)
        lstm_out, _ = self.lstm(x)

        # Увага
        attn_scores = self.attention(lstm_out).squeeze(-1)  # (batch, seq_len)
        attn_weights = torch.softmax(attn_scores, dim=1)    # (batch, seq_len)
        context = (lstm_out * attn_weights.unsqueeze(-1)).sum(dim=1)  # (batch, hidden*dir)

        # Прогноз
        output = self.regressor(context)  # (batch, 1)
        return output, attn_weights


class LSTMPredictor:
    """
    Високорівнева обгортка для навчання, оцінки та інференсу LSTM-моделі.

    Використання
    -----
    >>> predictor = LSTMPredictor(input_size=8, seq_len=24)
    >>> predictor.fit(X_train, y_train, X_val, y_val, epochs=50)
    >>> y_pred = predictor.predict(X_test)
    >>> predictor.save("models/checkpoints/lstm_best.pt")
    """

    def __init__(
        self,
        input_size: int = 8,
        seq_len: int = 24,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.25,
        lr: float = 1e-3,
        batch_size: int = 64,
        device: Optional[str] = None,
    ) -> None:
        self.input_size = input_size
        self.seq_len = seq_len
        self.batch_size = batch_size

        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        logger.info(f"LSTMPredictor використовує пристрій: {self.device}")

        self.model = LSTMTowerModel(input_size, hidden_size, num_layers, dropout).to(self.device)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr, weight_decay=1e-4)
        self.criterion = nn.HuberLoss(delta=0.1)

        self._train_losses: list[float] = []
        self._val_losses: list[float] = []
        self._best_val_loss: float = float("inf")

    # ------------------------------------------------------------------ #
    #  Навчання                                                           #
    # ------------------------------------------------------------------ #

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int = 100,
        patience: int = 15,
        checkpoint_path: str = "models/checkpoints/lstm_best.pt",
    ) -> dict:
        """
        Навчити LSTM-модель з ранньою зупинкою.

        Параметри
        ----------
        X_train, X_val : масиви розміру (N, seq_len, n_features)
        y_train, y_val : цільові масиви розміру (N,)
        epochs : максимальна кількість епох навчання
        patience : терпіння ранньої зупинки (епохи без покращення валідації)
        checkpoint_path : шлях для збереження найкращих ваг моделі

        Повертає
        -------
        словник history з ключами 'train_loss' та 'val_loss'.
        """
        train_loader = self._make_loader(X_train, y_train, shuffle=True)
        val_loader = self._make_loader(X_val, y_val, shuffle=False)

        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=epochs, eta_min=1e-5
        )

        no_improve = 0
        for epoch in range(1, epochs + 1):
            train_loss = self._train_epoch(train_loader)
            val_loss = self._eval_epoch(val_loader)
            scheduler.step()

            self._train_losses.append(train_loss)
            self._val_losses.append(val_loss)

            if val_loss < self._best_val_loss:
                self._best_val_loss = val_loss
                Path(checkpoint_path).parent.mkdir(parents=True, exist_ok=True)
                torch.save(self.model.state_dict(), checkpoint_path)
                no_improve = 0
            else:
                no_improve += 1

            if epoch % 10 == 0 or epoch == 1:
                logger.info(
                    f"Епоха {epoch:3d}/{epochs} | train_loss={train_loss:.6f} "
                    f"| val_loss={val_loss:.6f} | best={self._best_val_loss:.6f}"
                )

            if no_improve >= patience:
                logger.info(f"Рання зупинка на епосі {epoch} (patience={patience}).")
                break

        # Завантажити найкращі ваги
        self.model.load_state_dict(torch.load(checkpoint_path, map_location=self.device))
        return {"train_loss": self._train_losses, "val_loss": self._val_losses}

    def _train_epoch(self, loader: DataLoader) -> float:
        self.model.train()
        total = 0.0
        for X_batch, y_batch in loader:
            X_batch, y_batch = X_batch.to(self.device), y_batch.to(self.device)
            self.optimizer.zero_grad()
            pred, _ = self.model(X_batch)
            loss = self.criterion(pred.squeeze(-1), y_batch)
            loss.backward()
            nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
            total += loss.item() * len(y_batch)
        return total / len(loader.dataset)

    @torch.no_grad()
    def _eval_epoch(self, loader: DataLoader) -> float:
        self.model.eval()
        total = 0.0
        for X_batch, y_batch in loader:
            X_batch, y_batch = X_batch.to(self.device), y_batch.to(self.device)
            pred, _ = self.model(X_batch)
            loss = self.criterion(pred.squeeze(-1), y_batch)
            total += loss.item() * len(y_batch)
        return total / len(loader.dataset)

    # ------------------------------------------------------------------ #
    #  Інференс                                                           #
    # ------------------------------------------------------------------ #

    @torch.no_grad()
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Повернути прогнозований індекс пошкодження для масиву (N, seq_len, features)."""
        self.model.eval()
        loader = self._make_loader(X, np.zeros(len(X), dtype=np.float32), shuffle=False)
        preds = []
        for X_batch, _ in loader:
            X_batch = X_batch.to(self.device)
            p, _ = self.model(X_batch)
            preds.append(p.cpu().numpy().squeeze(-1))
        return np.concatenate(preds)

    @torch.no_grad()
    def predict_with_attention(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Повернути (прогнози, ваги_уваги) для інтерпретованості."""
        self.model.eval()
        loader = self._make_loader(X, np.zeros(len(X), dtype=np.float32), shuffle=False)
        preds, attns = [], []
        for X_batch, _ in loader:
            X_batch = X_batch.to(self.device)
            p, a = self.model(X_batch)
            preds.append(p.cpu().numpy().squeeze(-1))
            attns.append(a.cpu().numpy())
        return np.concatenate(preds), np.vstack(attns)

    # ------------------------------------------------------------------ #
    #  Метрики оцінки                                                     #
    # ------------------------------------------------------------------ #

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict:
        """Обчислити MAE, RMSE, MAPE та R² на тестовій вибірці."""
        y_pred = self.predict(X)
        mae = float(np.mean(np.abs(y_pred - y)))
        rmse = float(np.sqrt(np.mean((y_pred - y) ** 2)))
        mape = float(np.mean(np.abs((y_pred - y) / (np.abs(y) + 1e-8))) * 100)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        r2 = float(1 - ss_res / (ss_tot + 1e-10))
        return {"MAE": mae, "RMSE": rmse, "MAPE": mape, "R2": r2}

    # ------------------------------------------------------------------ #
    #  Збереження та завантаження                                         #
    # ------------------------------------------------------------------ #

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "model_state": self.model.state_dict(),
                "config": {
                    "input_size": self.input_size,
                    "seq_len": self.seq_len,
                },
            },
            path,
        )
        logger.info(f"LSTM-модель збережено до {path}")

    @classmethod
    def load(cls, path: str, **kwargs) -> "LSTMPredictor":
        ckpt = torch.load(path, map_location="cpu")
        config = ckpt["config"]
        obj = cls(input_size=config["input_size"], seq_len=config["seq_len"], **kwargs)
        obj.model.load_state_dict(ckpt["model_state"])
        logger.info(f"LSTM-модель завантажено з {path}")
        return obj

    # ------------------------------------------------------------------ #
    #  Допоміжні методи                                                   #
    # ------------------------------------------------------------------ #

    def _make_loader(self, X: np.ndarray, y: np.ndarray, shuffle: bool) -> DataLoader:
        X_t = torch.tensor(X, dtype=torch.float32)
        y_t = torch.tensor(y, dtype=torch.float32)
        ds = TensorDataset(X_t, y_t)
        return DataLoader(ds, batch_size=self.batch_size, shuffle=shuffle, num_workers=0)
