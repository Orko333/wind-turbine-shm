"""
Виділення ознак із сигналів датчиків вітрової турбіни для моделей МН.

Витягує часові, частотні та статистичні ознаки з:
  - 10-хвилинних зведених статистик SCADA
  - Високочастотних сигналів тензодатчиків та акселерометрів

Групи ознак:
  1. Статистичні моменти (середнє, стд, асиметрія, куртозис)
  2. Енергія сигналу та RMS
  3. Гребеневий фактор, імпульсний фактор, граничний фактор (для CBM)
  4. Частотні: домінантна частота, спектральний центроїд, ознаки PSD
  5. Енергії вейвлет-смуг (DWT — дискретне вейвлет-перетворення)
  6. Rainflow-похідні: DEL, пошкодження на вікно
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal as sp_signal, stats as sp_stats
from typing import Optional
from loguru import logger

try:
    import pywt  # PyWavelets — необов'язкова залежність
    PYWT_AVAILABLE = True
except ImportError:
    PYWT_AVAILABLE = False
    logger.warning("PyWavelets не встановлено — вейвлет-ознаки вимкнено.")


class FeatureExtractor:
    """
    Багатодоменний екстрактор ознак для сигналів SHM.

    Формує плаский вектор ознак із вікна сирих сенсорних даних, готовий
    для подачі до моделей XGBoost, LSTM або Автокодера.

    Параметри
    ----------
    fs : float — частота дискретизації [Гц] для ВЧ-сигналів.
    wavelet : str — материнський вейвлет для DWT (за замовчуванням 'db4').
    wavelet_levels : int — кількість рівнів декомпозиції.
    """

    # Назви ознак, що генерує extract_hf_features()
    HF_FEATURE_NAMES = [
        # ---- Ознаки тензодатчика ----
        "strain_mean", "strain_std", "strain_rms", "strain_peak",
        "strain_skewness", "strain_kurtosis",
        "strain_crest_factor", "strain_impulse_factor",
        "strain_peak_to_peak",
        # ---- Ознаки акселерометра ----
        "accel_mean", "accel_std", "accel_rms", "accel_peak",
        "accel_skewness", "accel_kurtosis",
        "accel_crest_factor", "accel_impulse_factor",
        "accel_peak_to_peak",
        # ---- Крос-сигнальні ознаки ----
        "cross_correlation_peak",
        "phase_lag_samples",
        # ---- Частотна область (акселерометр) ----
        "dominant_freq_hz", "spectral_centroid_hz",
        "spectral_bandwidth_hz", "spectral_rolloff_hz",
        "psd_low_band_energy", "psd_mid_band_energy", "psd_high_band_energy",
        # ---- Вейвлет-енергія (db4, 5 рівнів) ----
        "wavelet_energy_l1", "wavelet_energy_l2", "wavelet_energy_l3",
        "wavelet_energy_l4", "wavelet_energy_l5",
    ]

    # Стовпці SCADA-ознак, що очікуються у вхідному DataFrame
    SCADA_FEATURE_NAMES = [
        "wind_speed_mean", "wind_speed_std",
        "rotor_speed_rpm", "pitch_angle_deg",
        "active_power_kw", "tower_base_moment_kNm",
        "tower_top_accel_rms", "nacelle_temp_degC",
    ]

    def __init__(
        self,
        fs: float = 100.0,
        wavelet: str = "db4",
        wavelet_levels: int = 5,
    ) -> None:
        self.fs = fs
        self.wavelet = wavelet
        self.wavelet_levels = wavelet_levels

    # ------------------------------------------------------------------ #
    #  Ознаки високочастотного сигналу                                    #
    # ------------------------------------------------------------------ #

    def extract_hf_features(
        self,
        strain: np.ndarray,
        accel: np.ndarray,
    ) -> np.ndarray:
        """
        Витягнути повний ВЧ-вектор ознак з одного вікна сигналу.

        Параметри
        ----------
        strain : 1-D масив показників тензодатчика [мікродеформація]
        accel  : 1-D масив показників акселерометра [м/с²]

        Повертає
        -------
        features : 1-D масив float32 довжини len(HF_FEATURE_NAMES)
        """
        feats: list[float] = []

        feats.extend(self._time_domain_features(strain))
        feats.extend(self._time_domain_features(accel))
        feats.extend(self._cross_features(strain, accel))
        feats.extend(self._frequency_features(accel))
        feats.extend(self._wavelet_energy(accel))

        return np.array(feats, dtype=np.float32)

    @staticmethod
    def _time_domain_features(sig: np.ndarray) -> list[float]:
        """9 скалярних ознак часової області."""
        rms = float(np.sqrt(np.mean(sig ** 2)))
        peak = float(np.max(np.abs(sig)))
        mean_abs = float(np.mean(np.abs(sig)))

        crest = peak / (rms + 1e-10)
        impulse = peak / (mean_abs + 1e-10)
        p2p = float(sig.max() - sig.min())
        kurtosis = float(sp_stats.kurtosis(sig, fisher=False))
        skewness = float(sp_stats.skew(sig))

        return [
            float(sig.mean()), float(sig.std()), rms, peak,
            skewness, kurtosis,
            crest, impulse, p2p,
        ]

    @staticmethod
    def _cross_features(s1: np.ndarray, s2: np.ndarray) -> list[float]:
        """Крос-сигнальні: пік взаємної кореляції та відповідний фазовий зсув."""
        n = len(s1)
        corr = np.correlate(s1 - s1.mean(), s2 - s2.mean(), mode="full") / (n * s1.std() * s2.std() + 1e-10)
        peak_idx = int(np.argmax(np.abs(corr)))
        phase_lag = float(peak_idx - (n - 1))
        return [float(np.max(np.abs(corr))), phase_lag]

    def _frequency_features(self, sig: np.ndarray) -> list[float]:
        """7 частотних ознак через Welch PSD."""
        freqs, psd = sp_signal.welch(sig, fs=self.fs, nperseg=min(256, len(sig)))

        # Домінантна частота
        dom_freq = float(freqs[np.argmax(psd)])

        # Спектральний центроїд
        total_power = psd.sum() + 1e-12
        centroid = float(np.sum(freqs * psd) / total_power)

        # Спектральна ширина смуги (стандартне відхилення навколо центроїда)
        bw = float(np.sqrt(np.sum(((freqs - centroid) ** 2) * psd) / total_power))

        # Спектральний спад (85% загальної енергії)
        cum_power = np.cumsum(psd)
        rolloff_idx = np.searchsorted(cum_power, 0.85 * cum_power[-1])
        rolloff = float(freqs[min(rolloff_idx, len(freqs) - 1)])

        # Енергія смуг: низька [0.1–2 Гц], середня [2–10 Гц], висока [10–40 Гц]
        def band_energy(f_low, f_high):
            mask = (freqs >= f_low) & (freqs < f_high)
            return float(psd[mask].sum()) if mask.any() else 0.0

        return [dom_freq, centroid, bw, rolloff,
                band_energy(0.1, 2.0), band_energy(2.0, 10.0), band_energy(10.0, 40.0)]

    def _wavelet_energy(self, sig: np.ndarray) -> list[float]:
        """Енергії вейвлет-підсмуг із використанням дискретного вейвлет-перетворення (DWT)."""
        if not PYWT_AVAILABLE:
            return [0.0] * self.wavelet_levels

        coeffs = pywt.wavedec(sig, self.wavelet, level=self.wavelet_levels)
        energies = [float(np.sum(c ** 2)) / (len(c) + 1e-12) for c in coeffs[1:]]  # апроксимацію пропускаємо
        # Доповнити або обрізати до рівно wavelet_levels значень
        while len(energies) < self.wavelet_levels:
            energies.append(0.0)
        return energies[:self.wavelet_levels]

    # ------------------------------------------------------------------ #
    #  Побудова матриці SCADA-ознак                                       #
    # ------------------------------------------------------------------ #

    def build_scada_feature_matrix(
        self,
        df: pd.DataFrame,
        extra_cols: Optional[list[str]] = None,
    ) -> pd.DataFrame:
        """
        Побудувати матрицю ознак із попередньо обробленого SCADA-датафрейму.

        Додає ковзні статистики (вікно 24 = 4 год, вікно 144 = 1 доба)
        для захоплення трендів у часовому ряді.

        Повертає DataFrame з оригінальними та ковзними ознаками.
        """
        feature_cols = [c for c in self.SCADA_FEATURE_NAMES if c in df.columns]
        if extra_cols:
            feature_cols += [c for c in extra_cols if c in df.columns]

        result = df[feature_cols].copy()

        for col in feature_cols:
            result[f"{col}_roll24_mean"] = df[col].rolling(24, min_periods=1).mean()
            result[f"{col}_roll24_std"] = df[col].rolling(24, min_periods=1).std().fillna(0)
            result[f"{col}_roll144_mean"] = df[col].rolling(144, min_periods=1).mean()

        # Дельта-ознаки: різниця першого порядку (індикатор тренду)
        for col in feature_cols:
            result[f"{col}_delta"] = df[col].diff().fillna(0)

        return result.astype(np.float32)

    def extract_hf_feature_matrix(
        self,
        hf_df: pd.DataFrame,
        strain_col: str = "strain_signal",
        accel_col: str = "accel_signal",
    ) -> np.ndarray:
        """
        Витягнути матрицю ВЧ-ознак із DataFrame вікон сигналів.

        Кожен рядок hf_df повинен мати стовпці 'strain_signal' та 'accel_signal',
        що містять масиви сирих сигналів (збережені як списки).

        Повертає масив float32 розміру (N, n_features).
        """
        rows = []
        for _, row in hf_df.iterrows():
            strain = np.asarray(row[strain_col], dtype=np.float32)
            accel = np.asarray(row[accel_col], dtype=np.float32)
            feats = self.extract_hf_features(strain, accel)
            rows.append(feats)
        return np.vstack(rows)

    # ------------------------------------------------------------------ #
    #  PCA для перевірки розмірності                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def variance_explained(X: np.ndarray, n_components: int = 10) -> np.ndarray:
        """
        Повернути частку поясненої дисперсії для компонент PCA.

        Використовується для перевірки того, що витягнуті ознаки
        несуть достатньо дискримінантної інформації.
        """
        from sklearn.decomposition import PCA
        from sklearn.preprocessing import StandardScaler
        X_s = StandardScaler().fit_transform(X)
        pca = PCA(n_components=min(n_components, X.shape[1]))
        pca.fit(X_s)
        return pca.explained_variance_ratio_
