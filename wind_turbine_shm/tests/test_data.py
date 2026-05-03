"""Модульні тести для генерації, завантаження та попередньої обробки даних."""

import numpy as np
import pandas as pd
import pytest
import tempfile
from pathlib import Path

from src.data.generator import SCADADataGenerator, TurbineParameters, WeibullWindModel
from src.data.preprocessor import SignalPreprocessor
from src.data.loader import DataLoader


# ── Генератор ──────────────────────────────────────────────────────────────

class TestSCADADataGenerator:

    @pytest.fixture
    def gen(self):
        return SCADADataGenerator(seed=42)

    def test_scada_shape(self, gen):
        """generate_scada повинен повертати DataFrame з очікуваною кількістю рядків."""
        df = gen.generate_scada(n_records=100)
        assert len(df) == 100

    def test_scada_required_columns(self, gen):
        """SCADA DataFrame повинен містити всі фізично обґрунтовані стовпці."""
        df = gen.generate_scada(n_records=50)
        for col in ["wind_speed_mean", "rotor_speed_rpm", "active_power_kw",
                    "tower_base_moment_kNm", "tower_top_accel_rms"]:
            assert col in df.columns, f"Відсутній стовпець: {col}"

    def test_wind_speed_positive(self, gen):
        """Усі згенеровані швидкості вітру повинні бути позитивними."""
        df = gen.generate_scada(n_records=200)
        assert (df["wind_speed_mean"] >= 0).all()

    def test_power_bounded(self, gen):
        """Активна потужність не повинна перевищувати номінальну."""
        df = gen.generate_scada(n_records=500)
        rated = gen.turbine.rated_power_kw
        assert (df["active_power_kw"] <= rated * 1.05).all()

    def test_timestamp_monotone(self, gen):
        """Часові мітки повинні бути суворо зростаючими."""
        df = gen.generate_scada(n_records=100)
        assert df["timestamp"].is_monotonic_increasing

    def test_hf_window_keys(self, gen):
        """generate_hf_window повинен повертати словник з масивами сигналів."""
        window = gen.generate_hf_window(v_mean=9.0, damage_index=0.2)
        assert "accel_ms2" in window
        assert "strain_microstrain" in window
        assert len(window["accel_ms2"]) > 0

    def test_hf_dataset_shape(self, gen):
        """generate_hf_dataset повинен повертати DataFrame з рядками."""
        scada_df = gen.generate_scada(n_records=50)
        hf_df = gen.generate_hf_dataset(scada_df, max_windows=20)
        assert isinstance(hf_df, pd.DataFrame)
        assert len(hf_df) > 0

    def test_turbine_parameters_rotor_area(self):
        """TurbineParameters.rotor_area повинен дорівнювати π*(D/2)²."""
        params = TurbineParameters(rotor_diameter=90.0)
        expected = np.pi * 45.0 ** 2
        assert abs(params.rotor_area - expected) < 1.0

    def test_weibull_wind_model_mean(self):
        """Швидкості вітру від SCADADataGenerator повинні підпорядковуватись розподілу Вейбулла (позитивні)."""
        gen = SCADADataGenerator(seed=0)
        df = gen.generate_scada(n_records=500)
        wind = df["wind_speed_mean"].values
        assert (wind > 0).all()
        assert wind.mean() > 4.0  # розумне середнє для k=2, c=8.5

    def test_reproducibility(self):
        """Однаковий seed повинен давати ідентичний результат."""
        g1 = SCADADataGenerator(seed=7)
        g2 = SCADADataGenerator(seed=7)
        df1 = g1.generate_scada(n_records=30)
        df2 = g2.generate_scada(n_records=30)
        pd.testing.assert_frame_equal(df1, df2)


# ── DataLoader ─────────────────────────────────────────────────────────────

class TestDataLoader:

    @pytest.fixture
    def sample_df(self):
        return pd.DataFrame({
            "a": range(100),
            "b": np.random.default_rng(0).random(100),
        })

    def test_chronological_split_sizes(self, sample_df):
        """Розбиття 70/15/15 за замовчуванням повинне у сумі давати загальну кількість рядків."""
        loader = DataLoader()
        train, val, test = loader.train_val_test_split(sample_df)
        assert len(train) + len(val) + len(test) == len(sample_df)

    def test_chronological_split_no_overlap(self, sample_df):
        """Хронологічне розбиття не повинне перетинатись."""
        loader = DataLoader()
        train, val, test = loader.train_val_test_split(sample_df)
        train_idx = set(train.index)
        val_idx = set(val.index)
        test_idx = set(test.index)
        assert train_idx.isdisjoint(val_idx)
        assert train_idx.isdisjoint(test_idx)
        assert val_idx.isdisjoint(test_idx)

    def test_split_fractions_approx(self, sample_df):
        """Навчальна вибірка повинна становити приблизно 70% від загальної кількості."""
        loader = DataLoader()
        train, val, test = loader.train_val_test_split(sample_df)
        assert abs(len(train) / len(sample_df) - 0.70) < 0.05

    def test_random_split_different_from_chronological(self, sample_df):
        """Випадкове розбиття повинне відрізнятись від хронологічного."""
        loader = DataLoader()
        train_c, _, _ = loader.train_val_test_split(sample_df, shuffle=False)
        train_r, _, _ = loader.train_val_test_split(sample_df, shuffle=True, seed=42)
        assert not train_c.equals(train_r)

    def test_class_weights_sum(self):
        """Ваги класів повинні бути обчислені для всіх класів."""
        loader = DataLoader()
        labels = np.array([0, 0, 0, 1, 1, 2])
        weights = loader.get_class_weights(labels)
        assert set(weights.keys()) == {0, 1, 2}
        assert all(w > 0 for w in weights.values())

    def test_load_parquet_roundtrip(self, sample_df):
        """load_scada повинен читати файл parquet і повертати DataFrame."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "scada_data.parquet"
            sample_df.to_parquet(path)
            loader = DataLoader(data_dir=tmpdir)
            loaded = loader.load_scada("scada_data.parquet")
            assert len(loaded) == len(sample_df)

    def test_load_csv_roundtrip(self, sample_df):
        """load_scada повинен також читати CSV-файли."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "scada_data.csv"
            sample_df["timestamp"] = pd.date_range("2024-01-01", periods=len(sample_df), freq="10min")
            sample_df.to_csv(path, index=False)
            loader = DataLoader(data_dir=tmpdir)
            loaded = loader.load_scada("scada_data.csv")
            assert len(loaded) == len(sample_df)


# ── SignalPreprocessor ──────────────────────────────────────────────────────

class TestSignalPreprocessor:

    @pytest.fixture
    def scada_df(self):
        rng = np.random.default_rng(99)
        n = 200
        return pd.DataFrame({
            "wind_speed_mean": rng.uniform(3, 20, n),
            "wind_speed_std": rng.uniform(0.5, 3, n),
            "rotor_speed_rpm": rng.uniform(5, 20, n),
            "pitch_angle_deg": rng.uniform(0, 15, n),
            "active_power_kw": rng.uniform(0, 2000, n),
            "tower_base_moment_kNm": rng.uniform(10000, 80000, n),
            "tower_top_accel_rms": rng.uniform(0.1, 1.0, n),
            "nacelle_temp_degC": rng.uniform(20, 60, n),
            "damage_index": rng.uniform(0, 0.5, n),
        })

    def test_fit_transform_returns_dataframe(self, scada_df):
        """fit_transform_scada повинен повертати DataFrame."""
        prep = SignalPreprocessor()
        result = prep.fit_transform_scada(scada_df)
        assert isinstance(result, pd.DataFrame)

    def test_fit_transform_preserves_rows(self, scada_df):
        """fit_transform_scada не повинен видаляти рядки."""
        prep = SignalPreprocessor()
        result = prep.fit_transform_scada(scada_df)
        assert len(result) == len(scada_df)

    def test_transform_without_fit_raises(self, scada_df):
        """transform_scada повинен викликати RuntimeError, якщо його викликати до fit_transform_scada."""
        prep = SignalPreprocessor()
        with pytest.raises(RuntimeError):
            prep.transform_scada(scada_df)

    def test_bandpass_filter_output_shape(self):
        """bandpass_filter повинен повертати сигнал тієї самої довжини."""
        prep = SignalPreprocessor(fs=1000.0)
        sig = np.random.default_rng(0).standard_normal(2000)
        filtered = prep.bandpass_filter(sig, low_hz=1.0, high_hz=400.0)
        assert len(filtered) == len(sig)

    def test_bandpass_attenuates_dc(self):
        """Смуговий фільтр повинен пригнічувати постійну складову (DC)."""
        prep = SignalPreprocessor(fs=1000.0)
        dc_signal = np.ones(2000) * 5.0
        filtered = prep.bandpass_filter(dc_signal, low_hz=1.0, high_hz=400.0)
        assert np.abs(filtered).mean() < 1.0

    def test_compute_psd_shape(self):
        """compute_psd повинен повертати масиви (freqs, power) однакової довжини."""
        prep = SignalPreprocessor(fs=100.0)
        sig = np.sin(2 * np.pi * 5.0 * np.linspace(0, 1, 1000))
        freqs, psd = prep.compute_psd(sig, nperseg=256)
        assert len(freqs) == len(psd)
        assert (psd >= 0).all()

    def test_prepare_sequences_shape(self, scada_df):
        """prepare_sequences повинен повертати тензор форми (N, seq_len, n_features)."""
        prep = SignalPreprocessor()
        df = prep.fit_transform_scada(scada_df)
        feature_cols = [c for c in SignalPreprocessor.SCADA_FEATURE_COLS if c in df.columns]
        X, y = prep.prepare_sequences(df, feature_cols=feature_cols,
                                      target_col="damage_index", seq_len=10)
        assert X.ndim == 3
        assert X.shape[1] == 10
        assert X.shape[2] == len(feature_cols)
        assert len(y) == len(X)

    def test_extract_natural_frequency_in_range(self):
        """extract_natural_frequency повинен повертати значення у заданому діапазоні."""
        prep = SignalPreprocessor(fs=200.0)
        f0 = 0.32
        t = np.linspace(0, 10, 2000)
        sig = np.sin(2 * np.pi * f0 * t) + 0.1 * np.random.default_rng(0).standard_normal(2000)
        f_nat = prep.extract_natural_frequency(sig, f_range=(0.1, 1.0))
        assert f_nat is not None
        assert 0.1 <= f_nat <= 1.0
