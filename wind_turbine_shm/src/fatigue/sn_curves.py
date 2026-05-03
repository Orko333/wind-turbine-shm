"""
Криві S-N (Велера) для сталевих конструктивних елементів веж вітрових турбін.

Крива S-N визначає залежність між діапазоном напружень Δσ і кількістю
циклів до руйнування N_f:

    N_f = C * Δσ^(-m)   ⟺   log(N_f) = log(C) - m * log(Δσ)

Для сталі веж вітрових турбін (IEC 61400-1, DNV-ST-0437, Eurocode 3):
  - Основний матеріал (базовий метал): m=3, log(C)=12.65 (FAT 71)
  - Зварні стикові з'єднання:          m=3, log(C)=12.592 (FAT 71 знижений)
  - Фланцеві болти (розтяг):           m=5, log(C)=17.117 (FAT 50)
  - Носок шва в оболонці:              m=3, log(C)=12.301 (FAT 56)

Посилання: DNV GL-ST-0437 (2016), Таблиця C-4; класи втоми IIW-1823-07.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Optional
from enum import Enum


class DetailCategory(Enum):
    """
    Категорія деталі втоми IIW / Eurocode 3 (клас FAT).
    Номер FAT дорівнює Δσ при N=2×10^6 циклах [МПа].
    """

    FAT_36 = "FAT_36"     # Важкі шви, підрізи
    FAT_50 = "FAT_50"     # Болтові з'єднання, кутові шви
    FAT_56 = "FAT_56"     # Носок шва в несучій пластині
    FAT_71 = "FAT_71"     # Стикові шви з повним проваром — оболонка башти
    FAT_90 = "FAT_90"     # Базовий метал, без значного зварювання
    FAT_112 = "FAT_112"   # Оброблена поверхня, базовий метал


# Параметри кривої S-N за IIW (бінійна):
#   Область 1 (N ≤ N_knee): нахил m1
#   Область 2 (N > N_knee): нахил m2 = m1 + 2 (знижений нахил після коліна витривалості)
_SN_PARAMS = {
    #               log10(C1)  m1   N_knee      log10(C2)   m2
    DetailCategory.FAT_36:  (11.808, 3.0, 5e6, 14.211, 5.0),
    DetailCategory.FAT_50:  (12.023, 3.0, 1e7, 15.606, 5.0),
    DetailCategory.FAT_56:  (12.301, 3.0, 1e7, 15.806, 5.0),
    DetailCategory.FAT_71:  (12.592, 3.0, 1e7, 16.301, 5.0),
    DetailCategory.FAT_90:  (12.736, 3.0, 1e7, 16.301, 5.0),
    DetailCategory.FAT_112: (12.882, 3.0, 1e7, 16.301, 5.0),
}


@dataclass
class SNcurve:
    """
    Загальна бінійна крива S-N за IIW-1823-07 / Eurocode 3 Додаток D.

    Атрибути
    ----------
    log_C1, m1 : параметри для N ≤ N_knee  (область багатоциклової втоми)
    log_C2, m2 : параметри для N > N_knee  (область гігациклової втоми)
    N_knee     : точка переходу (коліно витривалості)
    delta_sigma_d : межа витривалості [МПа] (N → ∞, нижче цього рівня пошкодження немає)
    safety_factor : частковий коефіцієнт безпеки γ_Mf ≥ 1.0 (ділить Δσ)
    """

    log_C1: float
    m1: float
    N_knee: float = 1e7
    log_C2: float = 0.0
    m2: float = 5.0
    delta_sigma_d: float = 0.0    # межа витривалості [МПа]; 0 = без межі
    safety_factor: float = 1.0   # γ_Mf за DNV-ST-0437 Таблиця 3-4

    def __post_init__(self) -> None:
        if self.log_C2 == 0.0:
            # Обчислити C2 для неперервності в N_knee
            sigma_knee = (10 ** self.log_C1 / self.N_knee) ** (1.0 / self.m1)
            self.log_C2 = float(np.log10(self.N_knee) + self.m2 * np.log10(sigma_knee))

    @classmethod
    def from_detail_category(
        cls,
        category: DetailCategory,
        safety_factor: float = 1.15,
    ) -> "SNcurve":
        """Побудувати криву S-N із категорії деталі втоми IIW."""
        log_C1, m1, N_knee, log_C2, m2 = _SN_PARAMS[category]
        return cls(log_C1=log_C1, m1=m1, N_knee=N_knee, log_C2=log_C2, m2=m2,
                   safety_factor=safety_factor)

    def cycles_to_failure(self, delta_sigma: float | np.ndarray) -> float | np.ndarray:
        """
        Обчислити N_f для заданого діапазону напружень Δσ [МПа].

        N_f = C1 * (Δσ * γ_Mf)^(-m1)   для N ≤ N_knee
        N_f = C2 * (Δσ * γ_Mf)^(-m2)   для N > N_knee
        N_f = ∞                          для Δσ ≤ Δσ_d
        """
        ds = np.asarray(delta_sigma, dtype=np.float64) * self.safety_factor

        # Нижче межі витривалості → нескінченний ресурс (без внеску в пошкодження)
        if self.delta_sigma_d > 0:
            ds = np.where(ds <= self.delta_sigma_d, np.inf, ds)

        C1 = 10 ** self.log_C1
        C2 = 10 ** self.log_C2

        N_region1 = np.where(ds > 0, C1 * ds ** (-self.m1), np.inf)
        N_region2 = np.where(ds > 0, C2 * ds ** (-self.m2), np.inf)

        N_f = np.where(N_region1 <= self.N_knee, N_region1, N_region2)
        return float(N_f) if np.ndim(delta_sigma) == 0 else N_f

    def stress_at_n_cycles(self, N: float) -> float:
        """Обернена крива S-N: діапазон напружень, що відповідає руйнуванню при N циклах."""
        if N <= self.N_knee:
            return float((10 ** self.log_C1 / N) ** (1.0 / self.m1)) / self.safety_factor
        return float((10 ** self.log_C2 / N) ** (1.0 / self.m2)) / self.safety_factor

    def damage_equivalent_load(
        self,
        ranges: np.ndarray,
        counts: np.ndarray,
        N_ref: float = 1e7,
    ) -> float:
        """
        Обчислити еквівалентне навантаження за пошкодженням (DEL) для гістограми діапазонів напружень.

        DEL — це діапазон напружень постійної амплітуди, що спричиняє таке саме
        накопичене пошкодження, що й уся змінноамплітудна навантажувальна
        історія при застосуванні протягом N_ref циклів.

        DEL = ( Σ(n_i * Δσ_i^m) / N_ref )^(1/m)

        Параметри
        ----------
        ranges : центри бінів діапазонів напружень [МПа]
        counts : кількість циклів на бін
        N_ref  : еталонна кількість циклів (за замовчуванням: 10^7)

        Повертає
        -------
        Значення DEL [МПа]
        """
        numerator = np.sum(counts * ranges ** self.m1)
        del_value = (numerator / N_ref) ** (1.0 / self.m1)
        return float(del_value)


class WeldedJointSN(SNcurve):
    """
    Попередньо налаштована крива S-N для стикових швів оболонки башти (FAT 71).

    Це визначальна категорія деталі втоми для кільцевого зварного шва
    «оболонка–фланець» вежі вітрової турбіни — найбільш критичне щодо втоми місце.

    Параметри (з DNV-ST-0437 Таблиця 4.4-1):
      m1 = 3, log(C1) = 12.592, N_knee = 10^7
      m2 = 5, γ_Mf = 1.15 (клас наслідків 2 — руйнування конструкції)
    """

    def __init__(self, safety_factor: float = 1.15) -> None:
        super().__init__(
            log_C1=12.592,
            m1=3.0,
            N_knee=1e7,
            log_C2=16.301,
            m2=5.0,
            delta_sigma_d=0.0,
            safety_factor=safety_factor,
        )


class FlangeBlotSN(SNcurve):
    """
    Крива S-N для болтів фланця башти під розтягом (FAT 50, m=5).

    Попередньо напружені болти M42 класу 10.9 у фланцевих секціях башти.
    """

    def __init__(self, safety_factor: float = 1.25) -> None:
        super().__init__(
            log_C1=15.117,
            m1=5.0,
            N_knee=2e6,
            log_C2=17.117,
            m2=5.0,
            delta_sigma_d=0.0,
            safety_factor=safety_factor,
        )
