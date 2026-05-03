"""
Утиліти завантаження даних — читає синтетичні набори даних CSV/Parquet
та готує розбивки на навчальну/валідаційну/тестову вибірки.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, Optional
from loguru import logger


class DataLoader:
    """Завантажує та розбиває набори даних SCADA / ВЧ-сигналів турбіни."""

    def __init__(self, data_dir: str = "data/synthetic") -> None:
        self.data_dir = Path(data_dir)

    def load_scada(self, filename: str = "scada_data.parquet") -> pd.DataFrame:
        path = self.data_dir / filename
        if path.suffix == ".parquet":
            df = pd.read_parquet(path)
        else:
            df = pd.read_csv(path, parse_dates=["timestamp"])
        logger.info(f"Завантажено SCADA: {len(df)} записів з {path}")
        return df

    def load_hf(self, filename: str = "hf_windows.parquet") -> pd.DataFrame:
        path = self.data_dir / filename
        if path.suffix == ".parquet":
            df = pd.read_parquet(path)
        else:
            df = pd.read_csv(path, parse_dates=["timestamp"])
        logger.info(f"Завантажено ВЧ-вікна: {len(df)} записів з {path}")
        return df

    def train_val_test_split(
        self,
        df: pd.DataFrame,
        train_frac: float = 0.70,
        val_frac: float = 0.15,
        shuffle: bool = False,
        seed: int = 42,
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Хронологічне (за замовчуванням) або випадкове розбивання на навчальну/валідаційну/тестову вибірки.

        Хронологічне розбивання зберігає часовий порядок — необхідно для реалістичної
        оцінки прогнозування залишкового ресурсу часових рядів (уникає витоку даних).
        """
        n = len(df)
        if shuffle:
            df = df.sample(frac=1, random_state=seed).reset_index(drop=True)

        n_train = int(n * train_frac)
        n_val = int(n * val_frac)

        train = df.iloc[:n_train].copy()
        val = df.iloc[n_train : n_train + n_val].copy()
        test = df.iloc[n_train + n_val :].copy()

        logger.info(
            f"Розбивка: навчання={len(train)}, валідація={len(val)}, тест={len(test)} "
            f"({'випадкова' if shuffle else 'хронологічна'})"
        )
        return train, val, test

    def get_class_weights(self, labels: np.ndarray) -> dict:
        """Обчислює ваги класів, обернені до частоти, для незбалансованих наборів даних."""
        classes, counts = np.unique(labels, return_counts=True)
        total = len(labels)
        weights = {int(c): float(total / (len(classes) * cnt)) for c, cnt in zip(classes, counts)}
        logger.info(f"Ваги класів: {weights}")
        return weights
