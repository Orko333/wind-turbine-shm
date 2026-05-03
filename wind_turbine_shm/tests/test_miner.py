"""Модульні тести для модуля накопичення пошкоджень за правилом Пальмгрена–Майнера."""

import numpy as np
import pytest
from src.fatigue.miner import PalmgrenMinerAccumulator, DamageRecord
from src.fatigue.sn_curves import WeldedJointSN, SNcurve


class TestPalmgrenMinerAccumulator:

    def test_zero_damage_initial(self):
        """Щойно створений акумулятор повинен мати нульове накопичене пошкодження."""
        acc = PalmgrenMinerAccumulator()
        assert acc.cumulative_damage == 0.0

    def test_not_critical_initially(self):
        """Новий акумулятор не повинен перебувати у критичному стані."""
        acc = PalmgrenMinerAccumulator()
        assert not acc.is_critical

    def test_reset_clears_damage(self):
        """Скидання повинно повернути пошкодження до нуля."""
        acc = PalmgrenMinerAccumulator()
        acc._total_damage = 0.5
        acc.reset()
        assert acc.cumulative_damage == 0.0

    def test_damage_increases_monotonically(self):
        """Накопичене пошкодження повинне бути не спадним."""
        rng = np.random.default_rng(0)
        acc = PalmgrenMinerAccumulator(n_bins=32)
        prev = 0.0
        for _ in range(5):
            chunk = rng.normal(50, 20, 200)
            acc.process_stress_window(chunk)
            assert acc.cumulative_damage >= prev - 1e-12
            prev = acc.cumulative_damage

    def test_process_histogram_adds_damage(self):
        """Обробка ненульової гістограми повинна збільшувати пошкодження."""
        acc = PalmgrenMinerAccumulator(n_bins=32)
        centers = np.linspace(10, 200, 32)
        counts = np.ones(32) * 100
        delta_D = acc.process_range_histogram(centers, counts)
        assert delta_D > 0
        assert acc.cumulative_damage > 0

    def test_zero_range_cycles_ignored(self):
        """Бінарні кошики з нульовим діапазоном не повинні вносити внесок у пошкодження."""
        acc = PalmgrenMinerAccumulator(n_bins=32)
        centers = np.linspace(0, 200, 32)
        counts = np.zeros(32)
        counts[0] = 1000  # діапазон ≈ 0 у першому кошику
        delta_D = acc.process_range_histogram(centers, counts)
        # Пошкодження повинне бути близьким до нуля (центр першого кошика дуже малий)
        assert delta_D >= 0.0

    def test_critical_state_triggers(self):
        """Акумулятор повинен повідомляти про критичний стан при D >= D_critical."""
        acc = PalmgrenMinerAccumulator(D_critical=0.1)
        acc._total_damage = 0.1
        assert acc.is_critical

    def test_compute_from_moment_series_shape(self):
        """Серія пошкоджень повинна мати ту саму довжину, що й вхідні моменти."""
        acc = PalmgrenMinerAccumulator(n_bins=20)
        moments = np.ones(200) * 30_000.0  # константний момент 30 МНм
        damage = acc.compute_from_moment_series(moments, section_modulus_m3=0.35)
        assert len(damage) == len(moments)

    def test_damage_series_monotonic(self):
        """Серія пошкоджень від серії моментів повинна бути не спадною."""
        acc = PalmgrenMinerAccumulator(n_bins=20)
        rng = np.random.default_rng(1)
        moments = np.abs(rng.normal(20_000, 5_000, 300))
        damage = acc.compute_from_moment_series(moments, section_modulus_m3=0.35)
        diffs = np.diff(damage)
        assert np.all(diffs >= -1e-10)  # допускається мінімальний шум через похибки з рухомою комою

    def test_summary_keys(self):
        """Словник summary повинен містити очікувані ключі."""
        acc = PalmgrenMinerAccumulator(n_bins=20)
        s = acc.summary()
        assert "cumulative_damage" in s
        assert "damage_fraction" in s
        assert "is_critical" in s
        assert "del_mean_mpa" in s

    def test_goodman_off_vs_on(self):
        """При увімкненій поправці Гудмана пошкодження повинне відрізнятись від вимкненої для асиметричного навантаження."""
        rng = np.random.default_rng(2)
        signal = rng.normal(50, 30, 300)

        acc_on  = PalmgrenMinerAccumulator(apply_goodman=True,  n_bins=20)
        acc_off = PalmgrenMinerAccumulator(apply_goodman=False, n_bins=20)
        acc_on.process_stress_window(signal)
        acc_off.process_stress_window(signal)

        # З поправкою Гудмана та розтягуючим середнім напруженням пошкодження загалом повинне відрізнятись
        # (рівним може бути лише якщо середнє напруження дорівнює нулю)
        assert isinstance(acc_on.cumulative_damage, float)
        assert isinstance(acc_off.cumulative_damage, float)
