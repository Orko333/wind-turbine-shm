"""Модульні тести для кривих S-N та категорій деталей для розрахунку втоми."""

import numpy as np
import pytest
from src.fatigue.sn_curves import SNcurve, WeldedJointSN, FlangeBlotSN, DetailCategory


class TestSNCurve:

    def test_weld_joint_sn_exists(self):
        """WeldedJointSN повинен створюватись без аргументів."""
        sn = WeldedJointSN()
        assert sn.m1 == 3.0
        assert sn.log_C1 == pytest.approx(12.592)

    def test_flange_bolt_sn_slope(self):
        """FlangeBlotSN повинен мати m1=5 (більший нахил для болтових з'єднань)."""
        sn = FlangeBlotSN()
        assert sn.m1 == 5.0

    def test_cycles_to_failure_decreasing(self):
        """Більший діапазон напружень повинен давати меншу кількість циклів до руйнування (монотонно)."""
        sn = WeldedJointSN()
        ranges = [20, 50, 100, 200]
        nf_vals = [sn.cycles_to_failure(r) for r in ranges]
        for a, b in zip(nf_vals, nf_vals[1:]):
            assert a > b

    def test_cycles_to_failure_positive(self):
        """N_f завжди повинен бути позитивним для позитивного діапазону напружень."""
        sn = WeldedJointSN()
        for r in [1, 10, 50, 100, 200, 500]:
            assert sn.cycles_to_failure(r) > 0

    def test_knee_continuity(self):
        """Крива S-N повинна бути неперервною в точці перегину N_knee."""
        sn = WeldedJointSN()
        sigma_knee = sn.stress_at_n_cycles(sn.N_knee * 0.999)
        n_just_before = sn.cycles_to_failure(sigma_knee)
        # Має бути приблизно рівним N_knee
        assert abs(n_just_before - sn.N_knee) / sn.N_knee < 0.01

    def test_vectorised_input(self):
        """cycles_to_failure повинен приймати масиви numpy."""
        sn = WeldedJointSN()
        ranges = np.array([10.0, 50.0, 100.0, 200.0])
        nf = sn.cycles_to_failure(ranges)
        assert nf.shape == (4,)
        assert np.all(nf > 0)

    def test_safety_factor_reduces_life(self):
        """Крива S-N з коефіцієнтом безпеки > 1.0 повинна давати менше циклів, ніж без нього."""
        sn_no_sf  = WeldedJointSN(safety_factor=1.0)
        sn_with_sf = WeldedJointSN(safety_factor=1.5)
        sigma = 80.0
        assert sn_with_sf.cycles_to_failure(sigma) < sn_no_sf.cycles_to_failure(sigma)

    def test_del_computation(self):
        """DEL повинен бути позитивним скалярним значенням."""
        sn = WeldedJointSN()
        centers = np.linspace(10, 200, 64)
        counts = np.random.default_rng(0).uniform(0, 100, 64)
        del_value = sn.damage_equivalent_load(centers, counts, N_ref=1e7)
        assert del_value > 0
        assert np.isfinite(del_value)

    def test_from_detail_category_fat71(self):
        """from_detail_category для FAT_71 повинен відповідати параметрам WeldedJointSN."""
        sn = SNcurve.from_detail_category(DetailCategory.FAT_71)
        ref = WeldedJointSN(safety_factor=1.15)
        assert sn.m1 == ref.m1
        assert sn.log_C1 == ref.log_C1

    def test_stress_at_n_cycles_inverse(self):
        """stress_at_n_cycles повинен бути оберненою функцією до cycles_to_failure."""
        sn = WeldedJointSN(safety_factor=1.0)
        sigma_original = 80.0
        N = sn.cycles_to_failure(sigma_original)
        sigma_recovered = sn.stress_at_n_cycles(N)
        assert abs(sigma_recovered - sigma_original) / sigma_original < 0.01
