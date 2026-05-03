"""Корекція напружень за діаграмою Гудмана для аналізу втоми з урахуванням впливу середнього напруження."""

import numpy as np
from dataclasses import dataclass
from typing import Tuple
from enum import Enum
from loguru import logger


class StressCorrection(Enum):
    """Методи корекції з урахуванням середнього напруження."""
    GOODMAN = "goodman"           # Лінійна діаграма Гудмана
    GERBER = "gerber"             # Параболічна корекція
    SODERBERG = "soderberg"       # Консервативна лінійна
    WALKER = "walker"             # На основі показника степеня (варіант Рамберга-Озгуда)
    MORROW = "morrow"             # Використовує справжню межу витривалості


@dataclass
class MaterialProperties:
    """Властивості матеріалу для аналізу втоми."""
    sigma_ult_mpa: float          # Межа міцності при розтязі [МПа]
    sigma_yield_mpa: float        # Межа текучості [МПа]
    sigma_fatigue_limit_mpa: float  # Межа витривалості [МПа] при N=10^7 циклах
    poisson_ratio: float = 0.3
    density_kg_m3: float = 7850.0  # Для сталі


# Типові властивості матеріалу для сталі башти вітрової турбіни (типово: E355, S355)
TOWER_STEEL_PROPERTIES = MaterialProperties(
    sigma_ult_mpa=490.0,         # Типова UTS для E355 / S355
    sigma_yield_mpa=355.0,       # Типова межа текучості для E355 / S355
    sigma_fatigue_limit_mpa=140.0,  # Консервативна оцінка (залежить від обробки поверхні, концентрації напружень)
)


class GoodmanCorrection:
    """
    Діаграма Гудмана для корекції впливу середнього напруження в аналізі втоми.

    Діаграма Гудмана коригує допустиму амплітуду знакозмінного напруження
    на основі середнього напруження, присутнього у циклічному навантаженні.
    Це критично важливо для веж вітрових турбін, де постійна гравітація створює
    ненульове середнє напруження.

    Теорія:
    -------
    Для циклу з:
      σ_mean = середнє напруження
      σ_alt = знакозмінне (напівдіапазону) напруження

    Еквівалентна амплітуда повністю знакозмінного напруження:
      σ_alt_eq = σ_alt * (σ_ult - σ_mean) / (σ_ult - σ_alt)

    Ця скоригована амплітуда потім використовується зі стандартними кривими S-N,
    які припускають повністю знакозмінне навантаження (σ_mean = 0).

    Посилання:
      - Goodman, J., "Mechanics Applied to Engineering", Longman, Green, 1899
      - IEC 61400-1, Розділ 7.7.2 (проєктування на втому)
      - DNV-ST-0437, Розділ 3, Таблиця 3-2
    """

    def __init__(
        self,
        material: MaterialProperties = TOWER_STEEL_PROPERTIES,
        method: StressCorrection = StressCorrection.GOODMAN,
    ):
        """
        Ініціалізує діаграму Гудмана з властивостями матеріалу.

        Args:
            material: Об'єкт властивостей матеріалу
            method: Метод корекції з урахуванням середнього напруження
        """
        self.material = material
        self.method = method
        logger.info(
            f"Goodman correction initialized: method={method.value}, "
            f"σ_ult={material.sigma_ult_mpa:.0f} MPa, "
            f"σ_limit={material.sigma_fatigue_limit_mpa:.0f} MPa"
        )

    def goodman_linear(
        self,
        sigma_alt: float,
        sigma_mean: float,
    ) -> float:
        """
        Лінійна корекція Гудмана.

        σ_alt,eq = σ_alt * (1 - σ_mean / σ_ult)

        де σ_ult — межа міцності при розтязі.

        Дещо неконсервативно для малих середніх напружень, консервативно для великих.
        """
        if self.material.sigma_ult_mpa <= 0:
            return sigma_alt

        correction = 1.0 - sigma_mean / self.material.sigma_ult_mpa
        # Гарантуємо невід'ємність
        correction = max(correction, 0.0)

        return sigma_alt * correction

    def gerber_parabolic(
        self,
        sigma_alt: float,
        sigma_mean: float,
    ) -> float:
        """
        Параболічна корекція (Гербер).

        σ_alt,eq = σ_alt * (1 - (σ_mean / σ_ult)^2)

        Точніша для кольорових металів, менш консервативна за Гудмана.
        """
        if self.material.sigma_ult_mpa <= 0:
            return sigma_alt

        ratio = sigma_mean / self.material.sigma_ult_mpa
        correction = 1.0 - (ratio ** 2)
        correction = max(correction, 0.0)

        return sigma_alt * correction

    def soderberg_conservative(
        self,
        sigma_alt: float,
        sigma_mean: float,
    ) -> float:
        """
        Консервативна лінійна корекція (Содерберг) на основі межі текучості.

        σ_alt,eq = σ_alt * (1 - σ_mean / σ_yield)

        Найбільш консервативна; використовує межу текучості замість межі міцності.
        """
        if self.material.sigma_yield_mpa <= 0:
            return sigma_alt

        correction = 1.0 - sigma_mean / self.material.sigma_yield_mpa
        correction = max(correction, 0.0)

        return sigma_alt * correction

    def walker_exponent(
        self,
        sigma_alt: float,
        sigma_mean: float,
        exponent: float = 0.5,
    ) -> float:
        """
        Метод Уокера з корекцією за степеневим законом.

        σ_alt,eq = σ_alt * ((σ_ult - σ_mean) / (σ_ult - σ_alt/2))^exponent

        Інтерполює між Гудманом (exponent=1) та іншими поведінками.
        Типове значення exponent=0.5 часто застосовують для сталей.
        """
        sigma_eq = sigma_alt / 2.0  # Половина амплітуди для припущення про симетричний цикл

        numerator = self.material.sigma_ult_mpa - sigma_mean
        denominator = self.material.sigma_ult_mpa - sigma_eq

        if denominator <= 0:
            return 0.0

        ratio = numerator / denominator
        if ratio <= 0:
            return 0.0

        return sigma_alt * (ratio ** exponent)

    def morrow_true_limit(
        self,
        sigma_alt: float,
        sigma_mean: float,
    ) -> float:
        """
        Метод Морроу зі справжньою межею втоми (а не асимптотичною межею витривалості).

        Враховує вплив середнього напруження на саму межу витривалості:
        σ_limit_corrected = σ_limit_0 * (1 - σ_mean / σ_ult)

        Менш консервативно за Гудмана для малих середніх напружень.
        """
        limit_corrected = self.material.sigma_fatigue_limit_mpa * (
            1.0 - sigma_mean / self.material.sigma_ult_mpa
        )
        limit_corrected = max(limit_corrected, 0.0)

        # Застосовуємо ту саму логіку, що й у Гудмана, але зі скоригованою межею
        sigma_alt_corrected = sigma_alt * (limit_corrected / self.material.sigma_fatigue_limit_mpa)

        return sigma_alt_corrected

    def correct_stress(
        self,
        sigma_alt: float,
        sigma_mean: float,
    ) -> float:
        """
        Застосовує корекцію за середнім напруженням обраним методом.

        Args:
            sigma_alt: Амплітуда знакозмінного (напівдіапазону) напруження [МПа]
            sigma_mean: Середнє напруження [МПа]

        Returns:
            Скоригована амплітуда напруження, еквівалентна повністю знакозмінному навантаженню [МПа]
        """
        if self.method == StressCorrection.GOODMAN:
            return self.goodman_linear(sigma_alt, sigma_mean)
        elif self.method == StressCorrection.GERBER:
            return self.gerber_parabolic(sigma_alt, sigma_mean)
        elif self.method == StressCorrection.SODERBERG:
            return self.soderberg_conservative(sigma_alt, sigma_mean)
        elif self.method == StressCorrection.WALKER:
            return self.walker_exponent(sigma_alt, sigma_mean)
        elif self.method == StressCorrection.MORROW:
            return self.morrow_true_limit(sigma_alt, sigma_mean)
        else:
            logger.warning(f"Unknown method {self.method}, using Goodman")
            return self.goodman_linear(sigma_alt, sigma_mean)

    def get_safe_stress_range(
        self,
        sigma_mean: float,
        s_n_curve_limit_mpa: float,
    ) -> float:
        """
        За заданим середнім напруженням знайти максимально безпечне знакозмінне напруження
        для конкретної межі кривої S-N.

        Це обернена функція до correct_stress(): за σ_mean і обмеженням на
        σ_alt,eq з кривих S-N — розв'язати щодо фактичного σ_alt.

        Args:
            sigma_mean: Середнє напруження [МПа]
            s_n_curve_limit_mpa: Допустиме еквівалентне напруження за кривою S-N [МПа]

        Returns:
            Максимально безпечне знакозмінне напруження [МПа]
        """
        if self.method == StressCorrection.GOODMAN:
            # σ_alt,eq = σ_alt * (1 - σ_mean / σ_ult)
            # σ_alt = σ_alt,eq / (1 - σ_mean / σ_ult)
            correction = 1.0 - sigma_mean / self.material.sigma_ult_mpa
            if correction <= 0:
                return 0.0
            return s_n_curve_limit_mpa / correction

        elif self.method == StressCorrection.GERBER:
            # σ_alt,eq = σ_alt * (1 - (σ_mean / σ_ult)^2)
            ratio_sq = (sigma_mean / self.material.sigma_ult_mpa) ** 2
            correction = 1.0 - ratio_sq
            if correction <= 0:
                return 0.0
            return s_n_curve_limit_mpa / correction

        elif self.method == StressCorrection.SODERBERG:
            correction = 1.0 - sigma_mean / self.material.sigma_yield_mpa
            if correction <= 0:
                return 0.0
            return s_n_curve_limit_mpa / correction

        else:
            # Для складних методів використовуємо ітеративний розв'язувач
            return self._solve_for_sigma_alt(sigma_mean, s_n_curve_limit_mpa)

    def _solve_for_sigma_alt(
        self,
        sigma_mean: float,
        target_equiv: float,
        tolerance: float = 0.1,
        max_iter: int = 50,
    ) -> float:
        """Ітеративно розв'язує щодо sigma_alt за заданим sigma_mean і цільовим еквівалентним напруженням."""
        sigma_alt = target_equiv  # Початкова здогадка

        for _ in range(max_iter):
            corrected = self.correct_stress(sigma_alt, sigma_mean)
            error = abs(corrected - target_equiv)

            if error < tolerance:
                return sigma_alt

            # Підлаштовування у стилі Ньютона
            sigma_alt *= target_equiv / (corrected + 1e-10)

        return sigma_alt

    def correction_factor(self, sigma_alt: float, sigma_mean: float) -> float:
        """
        Повертає коефіцієнт корекції k = σ_alt,eq / σ_alt.

        Корисно для візуалізації та розуміння впливу середнього напруження.

        Приклад:
          k = 0.8 означає, що наявність середнього напруження зменшує допустиме
          знакозмінне напруження до 80% від межі повністю знакозмінного.
        """
        if sigma_alt == 0:
            return 1.0
        return self.correct_stress(sigma_alt, sigma_mean) / sigma_alt

    def report(self, sigma_alt: float, sigma_mean: float) -> dict:
        """Формує детальний звіт про корекцію напруження."""
        sigma_alt_eq = self.correct_stress(sigma_alt, sigma_mean)
        k_factor = self.correction_factor(sigma_alt, sigma_mean)

        return {
            "method": self.method.value,
            "sigma_alternating_mpa": sigma_alt,
            "sigma_mean_mpa": sigma_mean,
            "sigma_equivalent_mpa": sigma_alt_eq,
            "correction_factor": k_factor,
            "material_ult_mpa": self.material.sigma_ult_mpa,
            "material_limit_mpa": self.material.sigma_fatigue_limit_mpa,
        }
