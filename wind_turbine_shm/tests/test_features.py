"""Модульні тести для модуля виділення ознак."""

import numpy as np
import pandas as pd
import pytest
from src.ml.features import FeatureExtractor


class TestFeatureExtractor:

    @pytest.fixture
    def extractor(self):
        return FeatureExtractor(fs=100.0, wavelet="db4", wavelet_levels=5)

    @pytest.fixture
    def signals(self):
        rng = np.random.default_rng(42)
        t = np.linspace(0, 10, 1000)
        strain = 50 * np.sin(2 * np.pi * 0.32 * t) + rng.normal(0, 5, 1000)
        accel  = 2.0 * np.sin(2 * np.pi * 1.5 * t) + rng.normal(0, 0.3, 1000)
        return strain.astype(np.float32), accel.astype(np.float32)

    def test_hf_feature_vector_length(self, extractor, signals):
        """Довжина вектора HF-ознак повинна дорівнювати len(HF_FEATURE_NAMES)."""
        strain, accel = signals
        feats = extractor.extract_hf_features(strain, accel)
        assert len(feats) == len(FeatureExtractor.HF_FEATURE_NAMES)

    def test_hf_features_finite(self, extractor, signals):
        """Усі HF-ознаки повинні бути скінченними (без NaN / Inf)."""
        strain, accel = signals
        feats = extractor.extract_hf_features(strain, accel)
        assert np.all(np.isfinite(feats)), f"Нескінченні ознаки: {feats[~np.isfinite(feats)]}"

    def test_rms_positive(self, extractor, signals):
        """Ознаки RMS завжди повинні бути невід'ємними."""
        strain, accel = signals
        feats = extractor.extract_hf_features(strain, accel)
        # strain_rms знаходиться за індексом 2, accel_rms — за індексом 11
        assert feats[2] >= 0.0
        assert feats[11] >= 0.0

    def test_crest_factor_gte_one(self, extractor, signals):
        """Коефіцієнт гребеня (пік/RMS) повинен бути ≥ 1.0 для будь-якого реального сигналу."""
        strain, accel = signals
        feats = extractor.extract_hf_features(strain, accel)
        # strain_crest_factor знаходиться за індексом 6
        assert feats[6] >= 1.0 - 1e-6

    def test_zero_signal_does_not_crash(self, extractor):
        """Нульовий сигнал не повинен викликати виняткових ситуацій."""
        strain = np.zeros(1000, dtype=np.float32)
        accel  = np.zeros(1000, dtype=np.float32)
        feats = extractor.extract_hf_features(strain, accel)
        assert len(feats) == len(FeatureExtractor.HF_FEATURE_NAMES)

    def test_scada_feature_matrix_shape(self, extractor):
        """Матриця SCADA-ознак повинна містити ковзні ознаки."""
        data = {col: np.random.default_rng(0).normal(0, 1, 300)
                for col in FeatureExtractor.SCADA_FEATURE_NAMES}
        df = pd.DataFrame(data)
        result = extractor.build_scada_feature_matrix(df)
        # Вихідні 8 + ковзні (3 на ознаку = 24) + дельта (8) = 40 стовпців
        assert result.shape[0] == 300
        assert result.shape[1] > 8

    def test_scada_matrix_dtype(self, extractor):
        """Матриця ознак повинна бути типу float32."""
        data = {col: np.ones(100) for col in FeatureExtractor.SCADA_FEATURE_NAMES}
        df = pd.DataFrame(data)
        result = extractor.build_scada_feature_matrix(df)
        assert result.dtypes.unique()[0] == np.float32

    def test_hf_feature_matrix_from_df(self, extractor, signals):
        """extract_hf_feature_matrix повинен обробляти всі рядки DataFrame."""
        strain, accel = signals
        hf_df = pd.DataFrame({
            "strain_signal": [strain.tolist()] * 5,
            "accel_signal": [accel.tolist()] * 5,
        })
        X = extractor.extract_hf_feature_matrix(hf_df)
        assert X.shape == (5, len(FeatureExtractor.HF_FEATURE_NAMES))

    def test_time_domain_features_shape(self, extractor, signals):
        """_time_domain_features повинен повертати рівно 9 значень."""
        strain, _ = signals
        feats = extractor._time_domain_features(strain)
        assert len(feats) == 9

    def test_frequency_features_shape(self, extractor, signals):
        """_frequency_features повинен повертати рівно 7 значень."""
        _, accel = signals
        feats = extractor._frequency_features(accel)
        assert len(feats) == 7

    def test_dominant_frequency_in_range(self, extractor):
        """Ознака домінантної частоти повинна виявляти задану частоту синусоїди."""
        fs = 100.0
        t = np.linspace(0, 10, int(fs * 10))
        f_inj = 5.0  # Гц
        sig = np.sin(2 * np.pi * f_inj * t).astype(np.float32)
        feats = extractor._frequency_features(sig)
        dom_freq = feats[0]
        assert abs(dom_freq - f_inj) < 1.0  # в межах 1 Гц
