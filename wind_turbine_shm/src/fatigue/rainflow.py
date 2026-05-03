"""
Алгоритм підрахунку циклів методом «дощової течії» — ASTM E1049-85.

Реалізація базується на 4-точковому алгоритмі, описаному Matsuishi & Endo (1968)
та стандартизованому в ASTM E1049-85.

Алгоритм перетворює випадкову історію напружень у набір дискретних
циклів напружень, що характеризуються:
  - діапазон напружень  Δσ = σ_max − σ_min
  - середнє напруження  σ_m = (σ_max + σ_min) / 2
  - кількість циклів    n   (0.5 для напівциклу, 1.0 для повного циклу)

Використовуються як вхідні дані для правила накопичення пошкоджень Пальмгрена–Майнера.
"""

from __future__ import annotations

import numpy as np
import rainflow as rf_lib   # еталонна реалізація ASTM E1049-85
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class FatigueCycle:
    """Представляє один підрахований цикл втоми."""

    stress_range: float   # Δσ  [МПа або кНм]
    mean_stress: float    # σ_m [МПа або кНм]
    count: float          # 0.5 (напівцикл) або 1.0 (повний цикл)


class RainflowCounter:
    """
    Лічильник циклів методом «дощової течії», що обгортає алгоритм ASTM E1049-85.

    Робочий процес
    --------
    1. Виділити точки перегину (локальні максимуми та мінімуми) із сирого сигналу.
    2. Застосувати 4-точковий алгоритм rainflow для виділення циклів.
    3. Побудувати матрицю Маркова (гістограма діапазон_напружень vs. середнє_напруження).

    Посилання
    ----------
    ASTM E1049-85 (2017). Standard Practices for Cycle Counting in Fatigue Analysis.
    Matsuishi, M. & Endo, T. (1968). Fatigue of metals subjected to varying stress.
    """

    def __init__(self, n_bins: int = 64) -> None:
        """
        Параметри
        ----------
        n_bins : int
            Кількість бінів для гістограми діапазонів напружень (матриця Маркова).
            IEC 61400-13 рекомендує 20–100 бінів. За замовчуванням 64.
        """
        if not (20 <= n_bins <= 128):
            raise ValueError("n_bins повинен бути між 20 та 128 (рекомендація IEC 61400-13).")
        self.n_bins = n_bins
        self._cycles: List[FatigueCycle] = []

    # ------------------------------------------------------------------ #
    #  Основний алгоритм                                                  #
    # ------------------------------------------------------------------ #

    def count(self, stress_history: np.ndarray) -> List[FatigueCycle]:
        """
        Виконати підрахунок rainflow для часового ряду напружень.

        Параметри
        ----------
        stress_history : одновимірний масив значень напружень [МПа або кНм]

        Повертає
        -------
        Список об'єктів FatigueCycle.
        """
        if len(stress_history) < 4:
            raise ValueError("Історія напружень повинна містити щонайменше 4 точки.")

        self._cycles = []
        for rng, mean, count, i_start, i_end in rf_lib.extract_cycles(stress_history):
            self._cycles.append(
                FatigueCycle(
                    stress_range=float(rng),
                    mean_stress=float(mean),
                    count=float(count),
                )
            )
        return self._cycles

    def count_manual(self, stress_history: np.ndarray) -> List[FatigueCycle]:
        """
        Реалізація 4-точкового rainflow на чистому Python (без зовнішніх бібліотек).

        Надається як прозора, перевіряєма еталонна реалізація для
        дипломної роботи. Використовує стековий алгоритм з ASTM E1049-85.
        """
        # Крок 1: виділити точки перегину
        peaks = self._extract_turning_points(stress_history)

        stack: List[float] = []
        cycles: List[FatigueCycle] = []

        for pt in peaks:
            stack.append(pt)
            while len(stack) >= 4:
                # Розглянути останні 4 точки
                X = abs(stack[-1] - stack[-2])
                Y = abs(stack[-2] - stack[-3])
                if X >= Y:
                    # Підрахувати цикл Y як повний або напівцикл
                    s_min = min(stack[-3], stack[-2])
                    s_max = max(stack[-3], stack[-2])
                    rng = s_max - s_min
                    mean = (s_max + s_min) / 2.0
                    if len(stack) >= 4:
                        cycles.append(FatigueCycle(rng, mean, 1.0))
                        # Видалити дві внутрішні точки
                        stack = stack[:-3] + [stack[-1]]
                    else:
                        break
                else:
                    break

        # Залишкові напівцикли
        for i in range(len(stack) - 1):
            rng = abs(stack[i + 1] - stack[i])
            mean = (stack[i + 1] + stack[i]) / 2.0
            cycles.append(FatigueCycle(rng, mean, 0.5))

        self._cycles = cycles
        return cycles

    @staticmethod
    def _extract_turning_points(y: np.ndarray) -> np.ndarray:
        """
        Зменшити сигнал до послідовності локальних максимумів та мінімумів.

        Точки перегину несуть всю інформацію, релевантну для втоми; проміжні
        відліки між екстремумами відкидаються.
        """
        if len(y) < 2:
            return y
        diff = np.diff(y)
        # Зміни знаку вказують на точки перегину
        sign_changes = np.where(np.diff(np.sign(diff)))[0] + 1
        indices = np.concatenate([[0], sign_changes, [len(y) - 1]])
        return y[indices]

    # ------------------------------------------------------------------ #
    #  Гістограма / матриця Маркова                                       #
    # ------------------------------------------------------------------ #

    def markov_matrix(
        self,
        cycles: List[FatigueCycle] = None,
        stress_max: float = None,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Побудувати матрицю Маркова кількості циклів відносно діапазону напружень.

        Параметри
        ----------
        cycles : список FatigueCycle — якщо None, використовується результат останнього count().
        stress_max : float — верхня межа для бінів; визначається автоматично, якщо None.

        Повертає
        -------
        matrix : масив (n_bins, n_bins) — кількість[бін_діапазону, бін_середнього]
        range_edges : межі бінів для діапазону напружень
        mean_edges  : межі бінів для середнього напруження
        """
        if cycles is None:
            cycles = self._cycles
        if not cycles:
            raise ValueError("Немає циклів для побудови матриці. Спочатку виконайте count().")

        ranges = np.array([c.stress_range for c in cycles])
        means = np.array([c.mean_stress for c in cycles])
        counts = np.array([c.count for c in cycles])

        r_max = stress_max or float(ranges.max()) * 1.05
        m_min, m_max = float(means.min()), float(means.max())

        range_edges = np.linspace(0, r_max, self.n_bins + 1)
        mean_edges = np.linspace(m_min, m_max, self.n_bins + 1)

        matrix = np.zeros((self.n_bins, self.n_bins))
        r_idx = np.clip(np.digitize(ranges, range_edges) - 1, 0, self.n_bins - 1)
        m_idx = np.clip(np.digitize(means, mean_edges) - 1, 0, self.n_bins - 1)
        np.add.at(matrix, (r_idx, m_idx), counts)

        return matrix, range_edges, mean_edges

    def range_histogram(
        self,
        cycles: List[FatigueCycle] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Одновимірна гістограма діапазонів напружень, зважена за кількістю циклів.

        Це основний вхід для підсумовування пошкоджень за Пальмгреном–Майнером,
        коли поправка на середнє напруження (Гудман) застосовується окремо.

        Повертає
        -------
        bin_centers : масив (n_bins,) репрезентативних діапазонів напружень
        counts      : масив (n_bins,) кількостей циклів на бін
        """
        if cycles is None:
            cycles = self._cycles
        if not cycles:
            raise ValueError("Немає циклів. Спочатку виконайте count().")

        ranges = np.array([c.stress_range for c in cycles])
        weights = np.array([c.count for c in cycles])

        hist, edges = np.histogram(ranges, bins=self.n_bins, weights=weights)
        centers = 0.5 * (edges[:-1] + edges[1:])
        return centers, hist

    # ------------------------------------------------------------------ #
    #  Поправка Гудмана на середнє напруження                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    def goodman_correction(
        cycles: List[FatigueCycle],
        ultimate_strength_mpa: float = 510.0,
    ) -> List[FatigueCycle]:
        """
        Перетворити асиметричні цикли на еквівалентні повністю знакозмінні цикли
        за допомогою модифікованого критерію Гудмана.

        Δσ_eq = Δσ / (1 - σ_m / σ_u)

        Параметри
        ----------
        cycles : список FatigueCycle
        ultimate_strength_mpa : σ_u — межа міцності при розтягу [МПа]
            За замовчуванням: конструкційна сталь S355, σ_u ≈ 510 МПа.

        Повертає
        -------
        Список скоригованих FatigueCycle із скоригованим stress_range.
        """
        corrected = []
        sigma_u = ultimate_strength_mpa
        for cyc in cycles:
            denom = 1.0 - cyc.mean_stress / sigma_u
            if denom <= 0:
                denom = 1e-6  # запобігти діленню на нуль для стискаючого середнього напруження
            eq_range = cyc.stress_range / denom
            corrected.append(FatigueCycle(eq_range, 0.0, cyc.count))
        return corrected
