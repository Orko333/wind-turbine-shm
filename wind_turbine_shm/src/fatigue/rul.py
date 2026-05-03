"""
Оцінка залишкового ресурсу (RUL) для вежі вітрової турбіни.

RUL — це час, що залишається до досягнення кумулятивного індексу пошкодження
Пальмгрена–Майнера критичного значення D_critical = 1.0 (або обраної проектної межі).

Реалізовано три методи оцінки:

1. **Лінійна екстраполяція** — припускає постійну середню швидкість пошкодження:
       RUL = (D_critical - D_current) / (dD/dt)_mean

2. **Експоненційне згладжування** — адаптує оцінку швидкості за допомогою EWMA:
       dD/dt_smooth = α * ΔD_new + (1-α) * dD/dt_prev

3. **Байєсівська модель деградації** — моделює D(t) як процес Вінера
   з дрейфом μ та дифузією σ. Надає розподіл RUL замість
   точкової оцінки. Уможливлює планування технічного обслуговування на основі ризику.

Посилання:
  Liao, L. & Köttig, F. (2014). Review of Hybrid Prognostics Approaches. IEEE TII.
  Li, N. et al. (2019). Remaining useful life prediction with Brownian motion. Rel. Eng.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Tuple
from scipy import stats
from loguru import logger


@dataclass
class RULResult:
    """Контейнер для результатів оцінки RUL."""

    rul_periods: float             # Точкова оцінка [кількість 10-хвилинних періодів]
    rul_hours: float               # Точкова оцінка [години]
    rul_days: float                # Точкова оцінка [дні]
    rul_years: float               # Точкова оцінка [роки]
    confidence_lower_days: float   # Нижня межа 90% довірчого інтервалу [дні]
    confidence_upper_days: float   # Верхня межа 90% довірчого інтервалу [дні]
    current_damage: float
    damage_rate_per_period: float  # dD/dt  [на 10-хвилинний період]
    method: str


class RULEstimator:
    """
    Оцінювач залишкового ресурсу трьома взаємодоповнювальними методами.

    Призначений для потокової роботи: викликайте `update()` для кожного нового
    10-хвилинного вікна SCADA; викликайте `estimate()` для отримання поточного RUL.

    Параметри
    ----------
    D_critical : float — індекс пошкодження при руйнуванні (за замовчуванням 1.0).
    period_minutes : float — період дискретизації [хвилини] (за замовчуванням 10).
    ewma_alpha : float — коефіцієнт згладжування для експоненційної середньої швидкості.
    min_history : int — мінімальна кількість вікон перед виконанням оцінки.
    """

    def __init__(
        self,
        D_critical: float = 1.0,
        period_minutes: float = 10.0,
        ewma_alpha: float = 0.05,
        min_history: int = 12,
    ) -> None:
        self.D_critical = D_critical
        self.period_minutes = period_minutes
        self.ewma_alpha = ewma_alpha
        self.min_history = min_history

        self._damage_history: list[float] = []
        self._rate_ewma: Optional[float] = None

    def update(self, current_damage: float) -> None:
        """Зареєструвати нове спостереження пошкодження."""
        self._damage_history.append(float(current_damage))
        if len(self._damage_history) >= 2:
            delta_D = self._damage_history[-1] - self._damage_history[-2]
            rate = max(delta_D, 0.0)   # пошкодження є монотонно зростаючим
            if self._rate_ewma is None:
                self._rate_ewma = rate
            else:
                self._rate_ewma = self.ewma_alpha * rate + (1 - self.ewma_alpha) * self._rate_ewma

    def estimate(self, method: str = "linear") -> Optional[RULResult]:
        """
        Оцінити RUL за вказаним методом.

        Параметри
        ----------
        method : "linear" | "ewma" | "bayesian"

        Повертає
        -------
        RULResult або None, якщо недостатньо даних в історії.
        """
        if len(self._damage_history) < self.min_history:
            logger.warning(
                f"Лише {len(self._damage_history)} спостережень; потрібно {self.min_history}."
            )
            return None

        D_now = self._damage_history[-1]

        if method == "linear":
            return self._linear_estimate(D_now)
        if method == "ewma":
            return self._ewma_estimate(D_now)
        if method == "bayesian":
            return self._bayesian_estimate(D_now)
        raise ValueError(f"Невідомий метод: '{method}'. Оберіть 'linear', 'ewma' або 'bayesian'.")

    # ------------------------------------------------------------------ #
    #  Метод 1: Лінійний (середня швидкість пошкодження)                #
    # ------------------------------------------------------------------ #

    def _linear_estimate(self, D_now: float) -> RULResult:
        """Проста лінійна екстраполяція за середньою швидкістю пошкодження."""
        n = len(self._damage_history)
        t = np.arange(n, dtype=np.float64)
        D = np.array(self._damage_history)

        # Нахил МНК = середня швидкість пошкодження [за період]
        slope, intercept, r, _, se = stats.linregress(t, D)
        rate = max(float(slope), 1e-12)

        rul_periods = (self.D_critical - D_now) / rate
        rul_periods = max(rul_periods, 0.0)

        # 90% довірчий інтервал за стандартною похибкою регресії
        t_crit = stats.t.ppf(0.95, df=n - 2) if n > 2 else 1.645
        ci_half_periods = t_crit * se / (rate ** 2) * (self.D_critical - D_now)
        ci_half_periods = max(ci_half_periods, 0)

        return self._build_result(rul_periods, ci_half_periods, rate, D_now, "linear")

    # ------------------------------------------------------------------ #
    #  Метод 2: EWMA (експоненційно зважена ковзна середня швидкість)   #
    # ------------------------------------------------------------------ #

    def _ewma_estimate(self, D_now: float) -> RULResult:
        """Згладжена EWMA швидкість пошкодження для адаптивної оцінки RUL."""
        rate = self._rate_ewma if self._rate_ewma is not None else 1e-12
        rate = max(rate, 1e-12)

        rul_periods = (self.D_critical - D_now) / rate
        rul_periods = max(rul_periods, 0.0)

        # Приблизний ДІ на основі варіації останніх швидкостей (останні 24 спостереження)
        recent_deltas = np.diff(self._damage_history[-25:])
        recent_deltas = np.maximum(recent_deltas, 0)
        rate_std = float(recent_deltas.std()) if len(recent_deltas) > 1 else rate * 0.2
        ci_half_periods = 1.645 * rate_std / (rate ** 2 + 1e-12) * (self.D_critical - D_now)
        ci_half_periods = abs(ci_half_periods)

        return self._build_result(rul_periods, ci_half_periods, rate, D_now, "ewma")

    # ------------------------------------------------------------------ #
    #  Метод 3: Байєсівський процес Вінера                              #
    # ------------------------------------------------------------------ #

    def _bayesian_estimate(self, D_now: float) -> RULResult:
        """
        Байєсівська модель деградації з використанням процесу Вінера з дрейфом.

        D(t) = μ*t + σ*W(t),  де W — стандартний броунівський рух.

        Час першого проходження (FPT) до D_critical має обернено-гаусівський
        (Вальда) розподіл із параметрами:
          μ_IG = (D_critical - D_now) / μ
          λ_IG = (D_critical - D_now)² / σ²

        Це забезпечує повний розподіл ймовірностей RUL, уможливлюючи
        рішення щодо технічного обслуговування на основі ризику з явними межами невизначеності.
        """
        n = len(self._damage_history)
        D_arr = np.array(self._damage_history)
        t_arr = np.arange(n, dtype=np.float64)

        # ОМП для дрейфу μ та дифузії σ
        increments = np.diff(D_arr)
        mu_hat = float(np.maximum(increments.mean(), 1e-12))
        sigma_hat = float(np.maximum(increments.std(), 1e-10))

        remaining = self.D_critical - D_now
        if remaining <= 0:
            return self._build_result(0.0, 0.0, mu_hat, D_now, "bayesian")

        mu_IG = remaining / mu_hat              # математичне сподівання обернено-гаусівського [período]
        lambda_IG = (remaining ** 2) / (sigma_hat ** 2)  # параметр форми

        rul_periods = mu_IG

        # 90% ДІ для обернено-гаусівського розподілу
        # P(X ≤ x) для обернено-гаусівського — наближення через нормальне перетворення
        z = 1.645  # 90% ДІ
        ci_half_periods = z * mu_IG * np.sqrt(mu_IG / lambda_IG)

        return self._build_result(rul_periods, ci_half_periods, mu_hat, D_now, "bayesian")

    # ------------------------------------------------------------------ #
    #  Конструктор результату                                            #
    # ------------------------------------------------------------------ #

    def _build_result(
        self,
        rul_periods: float,
        ci_half_periods: float,
        rate: float,
        D_now: float,
        method: str,
    ) -> RULResult:
        """Перетворити RUL у періодах на зручні для читання одиниці часу."""
        mins_per_period = self.period_minutes
        to_hours = mins_per_period / 60.0
        to_days = mins_per_period / 1440.0
        to_years = mins_per_period / (1440.0 * 365.25)

        ci_lower = max((rul_periods - ci_half_periods) * to_days, 0.0)
        ci_upper = (rul_periods + ci_half_periods) * to_days

        return RULResult(
            rul_periods=rul_periods,
            rul_hours=rul_periods * to_hours,
            rul_days=rul_periods * to_days,
            rul_years=rul_periods * to_years,
            confidence_lower_days=ci_lower,
            confidence_upper_days=ci_upper,
            current_damage=D_now,
            damage_rate_per_period=rate,
            method=method,
        )

    # ------------------------------------------------------------------ #
    #  Пакетний RUL для повної історії                                   #
    # ------------------------------------------------------------------ #

    def compute_rul_series(
        self,
        damage_series: np.ndarray,
        method: str = "ewma",
    ) -> np.ndarray:
        """
        Обчислити оцінку RUL на кожному часовому кроці за повною історією пошкоджень.

        Параметри
        ----------
        damage_series : масив кумулятивного пошкодження D(t).
        method : метод оцінки.

        Повертає
        -------
        rul_days : RUL у днях на кожному часовому кроці (NaN де недостатньо даних).
        """
        self._damage_history = []
        self._rate_ewma = None
        rul_days = np.full(len(damage_series), np.nan)

        for i, d in enumerate(damage_series):
            self.update(d)
            result = self.estimate(method)
            if result is not None:
                rul_days[i] = result.rul_days

        return rul_days

    def alert_level(self, D: float) -> Tuple[str, str]:
        """
        Відобразити індекс пошкодження на рівень оповіщення та рекомендовану дію.

        Повертає (рівень, рекомендована_дія).
        """
        fraction = D / self.D_critical
        if fraction < 0.3:
            return "GREEN", "Нормальна експлуатація — планове моніторування."
        if fraction < 0.6:
            return "YELLOW", "Підвищене пошкодження — запланувати наступну перевірку."
        if fraction < 0.85:
            return "ORANGE", "Високе пошкодження — провести детальну перевірку протягом 30 днів."
        return "RED", "КРИТИЧНО — негайне відключення та перевірка обов'язкові."
