"""
Конвеєр попередньої обробки сигналів для даних системи структурного моніторингу вітрової турбіни.

Застосовує:
  1. Видалення викидів (на основі МКР)
  2. Заповнення пропущених значень (прямим заповненням, потім середнім)
  3. Мін-макс та стандартна нормалізація
  4. Смуговий фільтр (Баттерворта) для ВЧ-сигналів
  5. Ковзне вікно для виділення ознак у моделях часових рядів
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal as sp_signal
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from typing import Optional, Tuple
from loguru import logger
import joblib


class SignalPreprocessor:
    """
    Повний конвеєр попередньої обробки даних SCADA та високочастотних датчиків.

    Використання
    ------------
    >>> prep = SignalPreprocessor()
    >>> X_clean = prep.fit_transform_scada(scada_df)
    >>> X_scaled, y = prep.prepare_sequences(X_clean, target_col="damage_index", seq_len=24)
    """

    SCADA_FEATURE_COLS = [
        "wind_speed_mean",
        "wind_speed_std",
        "rotor_speed_rpm",
        "pitch_angle_deg",
        "active_power_kw",
        "tower_base_moment_kNm",
        "tower_top_accel_rms",
        "nacelle_temp_degC",
    ]

    def __init__(self, fs: float = 100.0) -> None:
        self.fs = fs
        self._scaler = StandardScaler()
        self._minmax = MinMaxScaler()
        self._fitted = False

    # ------------------------------------------------------------------ #
    #  Попередня обробка даних SCADA                                      #
    # ------------------------------------------------------------------ #

    def fit_transform_scada(self, df: pd.DataFrame) -> pd.DataFrame:
        """Очищає, заповнює та масштабує ознаки SCADA. Навчає масштабувальники."""
        df = self._remove_outliers(df.copy())
        df = self._impute(df)
        feature_cols = [c for c in self.SCADA_FEATURE_COLS if c in df.columns]
        df[feature_cols] = self._scaler.fit_transform(df[feature_cols])
        self._fitted = True
        logger.info(f"Препроцесор SCADA навчено на {len(df)} записах.")
        return df

    def transform_scada(self, df: pd.DataFrame) -> pd.DataFrame:
        """Трансформує ознаки SCADA за допомогою раніше навчених масштабувальників."""
        if not self._fitted:
            raise RuntimeError("Спочатку викличте fit_transform_scada.")
        df = self._impute(df.copy())
        feature_cols = [c for c in self.SCADA_FEATURE_COLS if c in df.columns]
        df[feature_cols] = self._scaler.transform(df[feature_cols])
        return df

    @staticmethod
    def _remove_outliers(df: pd.DataFrame, multiplier: float = 3.5) -> pd.DataFrame:
        """Замінює викиди за МКР на NaN для подальшого заповнення."""
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            if col == "damage_index":
                continue
            q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
            iqr = q3 - q1
            lower, upper = q1 - multiplier * iqr, q3 + multiplier * iqr
            n_out = ((df[col] < lower) | (df[col] > upper)).sum()
            if n_out:
                logger.debug(f"Стовпець '{col}': {n_out} викидів замінено на NaN.")
            df.loc[(df[col] < lower) | (df[col] > upper), col] = np.nan
        return df

    @staticmethod
    def _impute(df: pd.DataFrame) -> pd.DataFrame:
        """Пряме заповнення, потім зворотне заповнення, далі середнє по стовпцю для NaN що залишились."""
        df = df.ffill().bfill()
        for col in df.select_dtypes(include=[np.number]).columns:
            if df[col].isna().any():
                df[col].fillna(df[col].mean(), inplace=True)
        return df

    # ------------------------------------------------------------------ #
    #  Підготовка послідовностей для LSTM                                 #
    # ------------------------------------------------------------------ #

    def prepare_sequences(
        self,
        df: pd.DataFrame,
        feature_cols: Optional[list[str]] = None,
        target_col: str = "damage_index",
        seq_len: int = 24,
        step: int = 1,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Створює послідовності ковзного вікна з перекриттям для вхідних даних LSTM.

        Parameters
        ----------
        df : pd.DataFrame — попередньо оброблений DataFrame SCADA.
        feature_cols : list[str] — стовпці для використання як вхідні ознаки.
        target_col : str — стовпець для прогнозування (наступне значення після послідовності).
        seq_len : int — кількість кроків часу в послідовності.
        step : int — крок між послідовними вікнами.

        Returns
        -------
        X : масив float32 розміру (N, seq_len, n_features)
        y : масив float32 розміру (N,)
        """
        if feature_cols is None:
            feature_cols = [c for c in self.SCADA_FEATURE_COLS if c in df.columns]

        X_arr = df[feature_cols].values.astype(np.float32)
        y_arr = df[target_col].values.astype(np.float32)

        X_seqs, y_seqs = [], []
        for start in range(0, len(df) - seq_len, step):
            end = start + seq_len
            X_seqs.append(X_arr[start:end])
            y_seqs.append(y_arr[end])

        return np.stack(X_seqs), np.array(y_seqs, dtype=np.float32)

    # ------------------------------------------------------------------ #
    #  Фільтрація високочастотних сигналів                                #
    # ------------------------------------------------------------------ #

    def bandpass_filter(
        self,
        sig: np.ndarray,
        low_hz: float = 0.1,
        high_hz: float = 40.0,
        order: int = 4,
    ) -> np.ndarray:
        """
        Смуговий фільтр Баттерворта з нульовою фазою.

        Застосовується до сирих сигналів тензодатчиків та акселерометрів для видалення:
          - постійної складової (нижче 0.1 Гц)
          - високочастотних електромагнітних завад (вище 40 Гц)
        """
        nyq = self.fs / 2.0
        low = np.clip(low_hz / nyq, 1e-4, 0.999)
        high = np.clip(high_hz / nyq, 1e-4, 0.999)
        if low >= high:
            raise ValueError(f"Невірна смуга фільтра: [{low_hz}, {high_hz}] Гц")
        b, a = sp_signal.butter(order, [low, high], btype="band")
        return sp_signal.filtfilt(b, a, sig)

    def compute_psd(
        self,
        sig: np.ndarray,
        nperseg: int = 256,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Спектральна щільність потужності методом Велча.

        Повертає (частоти [Гц], СЩП [одиниці²/Гц]).
        Використовується для операційного модального аналізу (ОМА) — відстеження першої власної частоти.
        """
        freqs, psd = sp_signal.welch(sig, fs=self.fs, nperseg=nperseg, window="hann")
        return freqs, psd

    def extract_natural_frequency(self, sig: np.ndarray, f_range: Tuple[float, float] = (0.2, 0.5)) -> float:
        """
        Оцінює першу власну частоту башти за сигналом прискорення.

        Знаходить домінуючий спектральний пік у очікуваному діапазоні першої моди.
        Зниження оціненої частоти з часом є раннім індикатором
        втрати жорсткості внаслідок втомних тріщин.
        """
        freqs, psd = self.compute_psd(sig)
        mask = (freqs >= f_range[0]) & (freqs <= f_range[1])
        if not mask.any():
            return float("nan")
        peak_idx = np.argmax(psd[mask])
        return float(freqs[mask][peak_idx])

    # ------------------------------------------------------------------ #
    #  Збереження та завантаження                                         #
    # ------------------------------------------------------------------ #

    def save(self, path: str) -> None:
        joblib.dump({"scaler": self._scaler, "minmax": self._minmax, "fitted": self._fitted}, path)
        logger.info(f"Препроцесор збережено у {path}")

    @classmethod
    def load(cls, path: str) -> "SignalPreprocessor":
        obj = cls()
        state = joblib.load(path)
        obj._scaler = state["scaler"]
        obj._minmax = state["minmax"]
        obj._fitted = state["fitted"]
        return obj
