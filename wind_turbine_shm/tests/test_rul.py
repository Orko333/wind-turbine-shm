"""Модульні тести для оцінювача залишкового ресурсу (RUL)."""

import numpy as np
import pytest
from src.fatigue.rul import RULEstimator, RULResult


class TestRULEstimator:

    def test_insufficient_history_returns_none(self):
        """Оцінювач повинен повертати None, якщо доступна кількість спостережень менша за min_history."""
        est = RULEstimator(min_history=10)
        for i in range(5):
            est.update(float(i) * 0.01)
        assert est.estimate() is None

    def test_linear_estimate_positive(self):
        """Лінійна оцінка RUL повинна бути позитивною при D < D_critical."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        for i in range(20):
            est.update(float(i) * 0.01)  # D зростає від 0 до 0.19
        result = est.estimate(method="linear")
        assert result is not None
        assert result.rul_days > 0
        assert result.rul_years > 0

    def test_ewma_estimate_valid(self):
        """Оцінка за методом EWMA повинна повертати коректний об'єкт RULResult."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        for i in range(20):
            est.update(float(i) * 0.02)
        result = est.estimate(method="ewma")
        assert result is not None
        assert isinstance(result.rul_days, float)
        assert not np.isnan(result.rul_days)

    def test_bayesian_estimate_valid(self):
        """Байєсівська оцінка повинна повертати коректний об'єкт RULResult."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        for i in range(25):
            est.update(float(i) * 0.01)
        result = est.estimate(method="bayesian")
        assert result is not None
        assert result.rul_days >= 0

    def test_unknown_method_raises(self):
        """Невідомий метод оцінювання повинен викликати ValueError."""
        est = RULEstimator(min_history=5)
        for i in range(20):
            est.update(float(i) * 0.01)
        with pytest.raises(ValueError):
            est.estimate(method="unknown_method")

    def test_rul_decreases_as_damage_grows(self):
        """RUL повинен зменшуватись зі збільшенням накопиченого пошкодження."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        damages = np.linspace(0, 0.5, 50)
        rul_values = []
        for d in damages:
            est.update(d)
            res = est.estimate(method="ewma")
            if res is not None:
                rul_values.append(res.rul_days)

        if len(rul_values) > 5:
            # Загальна тенденція повинна бути спадною
            first_half_mean = np.mean(rul_values[:len(rul_values)//2])
            second_half_mean = np.mean(rul_values[len(rul_values)//2:])
            assert second_half_mean < first_half_mean

    def test_rul_series_shape(self):
        """compute_rul_series повинен повертати масив тієї самої довжини, що й вхідні дані."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        damage_series = np.linspace(0, 0.8, 100)
        rul_series = est.compute_rul_series(damage_series, method="ewma")
        assert len(rul_series) == 100

    def test_rul_series_nan_before_min_history(self):
        """Перші min_history-1 значень повинні бути NaN (недостатньо даних)."""
        est = RULEstimator(D_critical=1.0, min_history=10)
        damage_series = np.linspace(0, 0.5, 50)
        rul_series = est.compute_rul_series(damage_series, method="linear")
        assert np.all(np.isnan(rul_series[:9]))

    def test_confidence_interval_valid(self):
        """Нижня межа ДІ <= точкова оцінка RUL <= верхня межа ДІ."""
        est = RULEstimator(D_critical=1.0, min_history=5)
        for i in range(30):
            est.update(float(i) * 0.01)
        for method in ("linear", "ewma", "bayesian"):
            result = est.estimate(method=method)
            if result is not None:
                assert result.confidence_lower_days <= result.rul_days + 1e-6
                assert result.rul_days <= result.confidence_upper_days + 1e-6

    def test_alert_levels_cover_all_ranges(self):
        """Метод визначення рівня тривоги повинен повертати коректні рівні для всіх часток пошкодження."""
        est = RULEstimator()
        for d, expected_level in [
            (0.1, "GREEN"), (0.5, "YELLOW"), (0.75, "ORANGE"), (0.95, "RED")
        ]:
            level, msg = est.alert_level(d)
            assert level == expected_level
            assert isinstance(msg, str)
            assert len(msg) > 0

    def test_result_time_unit_consistency(self):
        """RUL у різних одиницях часу повинен бути узгодженим: дні ≈ години/24 ≈ роки*365."""
        est = RULEstimator(D_critical=1.0, min_history=5, period_minutes=10.0)
        for i in range(20):
            est.update(float(i) * 0.01)
        result = est.estimate(method="linear")
        if result is not None:
            assert abs(result.rul_hours - result.rul_days * 24) < 0.01
            assert abs(result.rul_years * 365.25 - result.rul_days) < 0.1
