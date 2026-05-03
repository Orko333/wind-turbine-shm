"""
Лінійне правило накопичення пошкоджень Пальмгрена–Майнера.

Кумулятивний індекс пошкодження від втоми D обчислюється як:

    D = Σ_{i=1}^{k}  n_i / N_f(Δσ_i)

де:
  n_i  — кількість циклів, підрахованих у бін діапазону напружень i (із Rainflow)
  N_f  — кількість циклів до руйнування при діапазоні напружень Δσ_i (із кривої S-N)

Руйнування прогнозується при D ≥ D_critical (зазвичай 1.0, але консервативне
значення 0.5–0.8 застосовується на практиці згідно DNV-ST-0437 §4.3.3).

Посилання:
  Palmgren, A. (1924). Die Lebensdauer von Kugellagern.
  Miner, M.A. (1945). Cumulative damage in fatigue.
  DNV-ST-0437:2016, §4.3 — Граничний стан втоми.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional
from loguru import logger

from .rainflow import FatigueCycle, RainflowCounter
from .sn_curves import SNcurve, WeldedJointSN


@dataclass
class DamageRecord:
    """Зберігає інкрементальні внески пошкодження на бін напружень."""

    stress_range_mpa: float
    mean_stress_mpa: float
    cycle_count: float
    n_to_failure: float
    damage_contribution: float


class PalmgrenMinerAccumulator:
    """
    Обчислює кумулятивний індекс пошкодження Пальмгрена–Майнера з послідовності
    історій напружень (наприклад, по одній на кожне 10-хвилинне вікно SCADA).

    Підтримує:
      - Послідовне оновлення (потокові дані датчиків)
      - Поправку на середнє напруження за Гудманом
      - Обчислення еквівалентного навантаження за пошкодженням (DEL) на вікно
      - Генерацію оповіщень на основі порогових значень
    """

    def __init__(
        self,
        sn_curve: SNcurve = None,
        D_critical: float = 1.0,
        apply_goodman: bool = True,
        ultimate_strength_mpa: float = 510.0,
        n_bins: int = 64,
    ) -> None:
        """
        Параметри
        ----------
        sn_curve : SNcurve — крива втоми (за замовчуванням: WeldedJointSN).
        D_critical : float — пошкодження при руйнуванні (за замовчуванням 1.0; використовуйте 0.8 для консерватизму).
        apply_goodman : bool — застосувати модифіковану поправку Гудмана.
        ultimate_strength_mpa : float — σ_u для діаграми Гудмана.
        n_bins : int — кількість бінів для гістограми Rainflow.
        """
        self.sn_curve = sn_curve or WeldedJointSN()
        self.D_critical = D_critical
        self.apply_goodman = apply_goodman
        self.sigma_u = ultimate_strength_mpa
        self.rainflow = RainflowCounter(n_bins=n_bins)

        self._total_damage: float = 0.0
        self._history: List[DamageRecord] = []
        self._del_history: List[float] = []

    @property
    def cumulative_damage(self) -> float:
        """Поточний кумулятивний індекс пошкодження D ∈ [0, D_critical]."""
        return self._total_damage

    @property
    def is_critical(self) -> bool:
        """True, якщо накопичене пошкодження досягло або перевищило D_critical."""
        return self._total_damage >= self.D_critical

    def reset(self) -> None:
        """Скинути всі накопичені пошкодження (початок нового ресурсу компонента)."""
        self._total_damage = 0.0
        self._history.clear()
        self._del_history.clear()

    # ------------------------------------------------------------------ #
    #  Основне обчислення пошкодження                                     #
    # ------------------------------------------------------------------ #

    def process_stress_window(
        self,
        stress_history: np.ndarray,
        stress_scale_factor: float = 1.0,
    ) -> float:
        """
        Накопичити пошкодження від втоми за одне часове вікно напружень.

        Параметри
        ----------
        stress_history : одновимірний масив значень напружень [МПа або кНм].
            Для часових рядів моментів у кНм вкажіть stress_scale_factor = S [МПа/кНм],
            де S = M * y / I (модуль перерізу).
        stress_scale_factor : float — перетворює одиниці в МПа перед пошуком у кривій S-N.

        Повертає
        -------
        delta_D : інкрементальне пошкодження від цього вікна.
        """
        if stress_scale_factor != 1.0:
            stress_history = stress_history * stress_scale_factor

        cycles = self.rainflow.count(stress_history)

        if self.apply_goodman:
            cycles = self.rainflow.goodman_correction(cycles, self.sigma_u)

        delta_D = self._sum_damage(cycles)
        self._total_damage += delta_D
        logger.debug(f"Вікно ΔD={delta_D:.6f}, кумулятивне D={self._total_damage:.4f}")
        return delta_D

    def process_range_histogram(
        self,
        bin_centers: np.ndarray,
        cycle_counts: np.ndarray,
    ) -> float:
        """
        Накопичити пошкодження безпосередньо з попередньо обчисленої гістограми діапазонів напружень.

        Використовується, коли підрахунок Rainflow вже виконано (наприклад, на крайовому
        обчислювальному обладнанні) і до хмари передається лише гістограма.

        Повертає інкрементальне пошкодження ΔD для цієї гістограми.
        """
        delta_D = 0.0
        for ds, n_i in zip(bin_centers, cycle_counts):
            if ds <= 0 or n_i <= 0:
                continue
            N_f = self.sn_curve.cycles_to_failure(ds)
            if N_f == 0 or np.isinf(N_f):
                continue
            contribution = n_i / N_f
            delta_D += contribution
            self._history.append(
                DamageRecord(
                    stress_range_mpa=float(ds),
                    mean_stress_mpa=0.0,
                    cycle_count=float(n_i),
                    n_to_failure=float(N_f),
                    damage_contribution=float(contribution),
                )
            )

        self._total_damage += delta_D

        # Обчислити DEL для цієї гістограми
        if cycle_counts.sum() > 0:
            del_value = self.sn_curve.damage_equivalent_load(bin_centers, cycle_counts)
            self._del_history.append(del_value)

        return delta_D

    def _sum_damage(self, cycles: list) -> float:
        """Внутрішнє підсумовування: D = Σ n_i / N_f(Δσ_i)."""
        delta_D = 0.0
        for cyc in cycles:
            if cyc.stress_range <= 0:
                continue
            N_f = self.sn_curve.cycles_to_failure(cyc.stress_range)
            if N_f == 0 or np.isinf(N_f):
                continue
            contribution = cyc.count / N_f
            delta_D += contribution
            self._history.append(
                DamageRecord(
                    stress_range_mpa=cyc.stress_range,
                    mean_stress_mpa=cyc.mean_stress,
                    cycle_count=cyc.count,
                    n_to_failure=N_f,
                    damage_contribution=contribution,
                )
            )
        return delta_D

    # ------------------------------------------------------------------ #
    #  Масове обчислення пошкодження з часового ряду моментів SCADA      #
    # ------------------------------------------------------------------ #

    def compute_from_moment_series(
        self,
        moments_kNm: np.ndarray,
        section_modulus_m3: float = 0.35,
        n_records: int = None,
    ) -> np.ndarray:
        """
        Обчислити кумулятивний індекс пошкодження для повного часового ряду моментів SCADA.

        Використовує спрощений розрахунок напружень:
            σ = M / W_el  (напруження згину в основі башти)

        Параметри
        ----------
        moments_kNm : одновимірний масив 10-хвилинних середніх згинальних моментів [кНм]
        section_modulus_m3 : W_el [м³] — пружний модуль перерізу основи башти
            Для башти діаметром 4.0 м, товщина стінки 25 мм: W_el ≈ 0.35 м³.
        n_records : необов'язкове обрізання для часткового аналізу.

        Повертає
        -------
        damage_series : масив кумулятивного пошкодження D(t) тієї самої довжини, що й моменти.
        """
        if n_records is not None:
            moments_kNm = moments_kNm[:n_records]

        # Перетворити момент у напруження: σ [МПа] = M [кН·м] / W_el [м³] * 1e3 / 1e6
        # = M [кНм] / W_el [м³] * 1e-3
        stress_mpa = moments_kNm / section_modulus_m3 * 1e-3

        self.reset()
        damage_series = np.zeros(len(stress_mpa))

        # Обробка блоками (імітує потокові крайові обчислення)
        chunk_size = 144  # 1 день з 10-хвилинних записів
        for i in range(0, len(stress_mpa), chunk_size):
            chunk = stress_mpa[i : i + chunk_size]
            if len(chunk) >= 4:
                self.process_stress_window(chunk)
            damage_series[i : i + chunk_size] = self._total_damage

        return damage_series

    # ------------------------------------------------------------------ #
    #  Зведення пошкоджень                                               #
    # ------------------------------------------------------------------ #

    def summary(self) -> dict:
        """Повернути словник із зведенням поточного стану пошкодження."""
        del_values = np.array(self._del_history) if self._del_history else np.array([0.0])
        return {
            "cumulative_damage": self._total_damage,
            "damage_fraction": min(self._total_damage / self.D_critical, 1.0),
            "n_cycles_total": sum(r.cycle_count for r in self._history),
            "del_mean_mpa": float(del_values.mean()),
            "del_max_mpa": float(del_values.max()),
            "is_critical": self.is_critical,
        }
