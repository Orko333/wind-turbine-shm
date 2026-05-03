"""Розрахунки аеродинамічної тяги і навантажень для вітрових турбін."""

import numpy as np
from dataclasses import dataclass
from typing import Dict, Tuple
from loguru import logger


@dataclass
class AerodynamicState:
    """Аеродинамічний стан турбіни."""
    wind_speed: float  # [м/с]
    rotor_speed: float  # [об/хв]
    pitch_angle: float  # [градуси]
    thrust_force: float  # [кН]
    rotor_power: float  # [кВт]
    tower_moment: float  # [кНм]
    tip_speed_ratio: float  # TSR = (omega*R) / v_wind


class AerodynamicModel:
    """Фізично обґрунтовані аеродинамічні розрахунки для вітрових турбін."""

    def __init__(
        self,
        rotor_diameter: float = 120.0,  # [м]
        tower_height: float = 100.0,  # [м]
        rated_power: float = 3000.0,  # [кВт]
        rated_wind_speed: float = 12.0,  # [м/с]
        cut_in_speed: float = 3.0,  # [м/с]
        cut_out_speed: float = 25.0,  # [м/с]
        air_density: float = 1.225,  # [кг/м³]
    ):
        self.rotor_diameter = rotor_diameter
        self.rotor_radius = rotor_diameter / 2
        self.tower_height = tower_height
        self.rated_power = rated_power
        self.rated_wind_speed = rated_wind_speed
        self.cut_in_speed = cut_in_speed
        self.cut_out_speed = cut_out_speed
        self.air_density = air_density

        # Площа, яку обмітає ротор
        self.rotor_area = np.pi * (self.rotor_radius ** 2)

        # Калібрування кривої потужності
        self._calibrate_power_curve()

    def _calibrate_power_curve(self):
        """Калібрує криву коефіцієнта потужності (Cp) за даними виробника."""
        # Типова крива Cp для турбіни 3 МВт (Siemens SWT-3.0-113)
        # Залежність TSR vs Cp
        self.tsr_values = np.array([0, 2, 4, 6, 7, 8, 9, 10, 12, 14])
        self.cp_values = np.array([0, 0.1, 0.35, 0.42, 0.45, 0.47, 0.46, 0.44, 0.35, 0.2])

        # Вплив кута кроку лопаті на Cp (0° кроку = максимум потужності, більший крок = менше потужності)
        self.pitch_factor_points = np.array([0, 10, 20, 30, 40])
        self.pitch_factors = np.array([1.0, 0.95, 0.85, 0.65, 0.35])

    def get_cp(self, tsr: float, pitch_angle: float = 0.0) -> float:
        """
        Повертає коефіцієнт потужності за швидкохідністю та кутом кроку лопаті.

        Cp — частка кінетичної енергії, яку можна вилучити з вітру.
        Максимальний теоретичний Cp (межа Беца) = 16/27 ≈ 0.593
        Практичний Cp для сучасних турбін ≈ 0.45-0.48
        """
        # Інтерполюємо Cp за TSR
        cp_tsr = np.interp(tsr, self.tsr_values, self.cp_values)

        # Застосовуємо корекцію за кутом кроку
        pitch_correction = np.interp(
            np.abs(pitch_angle), self.pitch_factor_points, self.pitch_factors
        )

        return cp_tsr * pitch_correction

    def get_thrust_coefficient(self, cp: float) -> float:
        """
        Обчислює коефіцієнт тяги (Ct) з коефіцієнта потужності (Cp).

        Базується на 1D-теорії імпульсу та моделі дискового приводу.
        Ct = 4 * a * (1 - a), де a — коефіцієнт осьової індукції.
        Співвідношення: Cp = 4 * a * (1 - a)^2
        """
        # Розв'язуємо для коефіцієнта індукції 'a' з Cp
        # Це кубічне рівняння, наближений розв'язок:
        if cp <= 0:
            return 0.0

        # Спрощене співвідношення, дійсне для типових значень Cp
        ct = min(4 * cp / 3, 8 / 9)  # Ct <= 8/9 (межа Беца)
        return ct

    def calculate_thrust(
        self,
        wind_speed: float,
        pitch_angle: float = 0.0,
    ) -> float:
        """
        Розраховує аеродинамічну силу тяги на роторі.

        Thrust = 0.5 * rho * A * v_wind^2 * Ct
        де Ct залежить від Cp і кута кроку лопаті.
        """
        if wind_speed < self.cut_in_speed or wind_speed > self.cut_out_speed:
            return 0.0

        # Для низьких швидкостей вітру оцінюємо TSR (спрощено)
        # Фактичний TSR = (omega * R) / v_wind
        # Для номінальних умов: TSR ≈ 8-9
        optimal_tsr = 8.5

        cp = self.get_cp(optimal_tsr, pitch_angle)
        ct = self.get_thrust_coefficient(cp)

        # Сила тяги [Н]
        thrust_n = 0.5 * self.air_density * self.rotor_area * (wind_speed ** 2) * ct

        return thrust_n / 1000  # Переводимо в кН

    def calculate_power(
        self,
        wind_speed: float,
        pitch_angle: float = 0.0,
    ) -> float:
        """
        Розраховує електричну потужність із керуванням кутом кроку лопаті.

        Power = 0.5 * rho * A * v_wind^3 * Cp
        Обмежено номінальною потужністю вище номінальної швидкості вітру.
        """
        if wind_speed < self.cut_in_speed:
            return 0.0

        if wind_speed >= self.cut_out_speed:
            return 0.0

        # Визначаємо кут кроку лопаті за швидкістю вітру (керування кроком)
        if wind_speed > self.rated_wind_speed:
            # Збільшуємо крок для зменшення потужності
            pitch_needed = min(
                (wind_speed - self.rated_wind_speed) * 3,  # ~3° на м/с понад номінальну
                45.0,  # Максимальний кут кроку
            )
        else:
            pitch_needed = pitch_angle

        optimal_tsr = 8.5
        cp = self.get_cp(optimal_tsr, pitch_needed)

        # Потужність [Вт]
        power_w = 0.5 * self.air_density * self.rotor_area * (wind_speed ** 3) * cp

        # Обмежуємо номінальною потужністю
        power_kw = min(power_w / 1000, self.rated_power)

        return power_kw

    def calculate_tower_moment(
        self,
        wind_speed: float,
        rotor_speed: float,
        pitch_angle: float = 0.0,
        rotor_mass: float = 500.0,  # [тонн]
        nacelle_mass: float = 250.0,  # [тонн]
    ) -> float:
        """
        Розраховує згинальний момент біля основи башти.

        M_base = Thrust * tower_height + gravity_moment

        Це основне навантаження, що спричиняє втому башти.
        """
        thrust_kn = self.calculate_thrust(wind_speed, pitch_angle)

        # Аеродинамічний момент від тяги
        aero_moment = thrust_kn * self.tower_height

        # Гравітаційний момент від маси гондоли/ротора
        # Припускаємо 10% відхилення на верхівці башти
        total_rotor_mass = rotor_mass + nacelle_mass
        gravity_moment = total_rotor_mass * 9.81 / 1000 * (self.tower_height * 0.1)

        total_moment_knm = aero_moment + gravity_moment

        return total_moment_knm

    def calculate_state(
        self,
        wind_speed: float,
        rotor_speed: float,
        pitch_angle: float = 0.0,
        rotor_mass: float = 500.0,
        nacelle_mass: float = 250.0,
    ) -> AerodynamicState:
        """Повний розрахунок аеродинамічного стану."""
        thrust = self.calculate_thrust(wind_speed, pitch_angle)
        power = self.calculate_power(wind_speed, pitch_angle)
        moment = self.calculate_tower_moment(
            wind_speed, rotor_speed, pitch_angle, rotor_mass, nacelle_mass
        )

        # Швидкохідність (Tip Speed Ratio)
        omega_rad_s = rotor_speed * 2 * np.pi / 60  # об/хв у рад/с
        tsr = (omega_rad_s * self.rotor_radius) / max(wind_speed, 0.1)

        return AerodynamicState(
            wind_speed=wind_speed,
            rotor_speed=rotor_speed,
            pitch_angle=pitch_angle,
            thrust_force=thrust,
            rotor_power=power,
            tower_moment=moment,
            tip_speed_ratio=tsr,
        )


class WindProfile:
    """Модель зміни швидкості вітру з висотою (зсув вітру)."""

    def __init__(self, reference_height: float = 10.0, reference_speed: float = 10.0):
        """
        Args:
            reference_height: Висота, на якій відома швидкість вітру [м]
            reference_speed: Швидкість вітру на еталонній висоті [м/с]
        """
        self.reference_height = reference_height
        self.reference_speed = reference_speed

    def power_law_profile(
        self,
        height: float,
        shear_exponent: float = 0.2,
    ) -> float:
        """
        Степеневий профіль вітру (поширений для умов суші):
        v(h) = v_ref * (h / h_ref)^alpha

        alpha ≈ 0.1 (рівнинна місцевість)
        alpha ≈ 0.2-0.3 (пересічена місцевість)
        """
        return self.reference_speed * (height / self.reference_height) ** shear_exponent

    def log_profile(
        self,
        height: float,
        roughness_length: float = 0.1,
    ) -> float:
        """
        Логарифмічний профіль вітру (атмосферний приземний шар):
        v(h) = v* / k * ln(h / z0)

        де v* — швидкість тертя, k ≈ 0.41 (стала фон Кармана)
        """
        kappa = 0.41
        v_star = self.reference_speed * kappa / np.log(
            self.reference_height / roughness_length
        )
        return (v_star / kappa) * np.log(height / roughness_length)

    def wind_shear_effect(
        self,
        tower_height: float,
        rotor_diameter: float,
        shear_exponent: float = 0.2,
    ) -> Tuple[float, float]:
        """
        Обчислює ефект зсуву вітру на 3-лопатевий ротор.

        Швидкість вітру змінюється між кінчиком лопаті (вгорі) та коренем (внизу).
        Це створює циклічне навантаження (частота 1P) на ротор.

        Returns:
            (wind_speed_top, wind_speed_bottom)
        """
        blade_radius = rotor_diameter / 2

        # Вітер на верхівці ротора
        height_top = tower_height + blade_radius
        wind_top = self.power_law_profile(height_top, shear_exponent)

        # Вітер біля основи ротора
        height_bottom = tower_height - blade_radius
        wind_bottom = self.power_law_profile(height_bottom, shear_exponent)

        return wind_top, wind_bottom

    def wind_shear_stress(
        self,
        tower_height: float,
        rotor_diameter: float,
        thrust_coefficient: float,
        air_density: float = 1.225,
    ) -> float:
        """
        Оцінює амплітуду циклічних напружень через зсув вітру.

        Це 1P-компонента (один прохід лопаті = один оберт).
        """
        wind_top, wind_bottom = self.wind_shear_effect(tower_height, rotor_diameter)

        # Тяга змінюється як wind_speed^2
        thrust_top = 0.5 * air_density * (rotor_diameter / 2) ** 2 * (wind_top ** 2) * thrust_coefficient
        thrust_bottom = 0.5 * air_density * (rotor_diameter / 2) ** 2 * (wind_bottom ** 2) * thrust_coefficient

        # Амплітуда циклічних напружень
        stress_amplitude = (thrust_top - thrust_bottom) * tower_height / (2 * 100)  # Нормалізована

        return stress_amplitude


class OffshoreLoading:
    """Хвильові і течійні навантаження для морських вітрових турбін."""

    def __init__(
        self,
        water_depth: float = 50.0,  # [м]
        wave_spectrum: str = "jonswap",  # Спектральна модель
    ):
        self.water_depth = water_depth
        self.wave_spectrum = wave_spectrum

    def jonswap_spectrum(
        self,
        frequency: np.ndarray,
        significant_wave_height: float = 3.0,  # [м]
        peak_frequency: float = 0.1,  # [Гц]
        gamma: float = 3.3,
    ) -> np.ndarray:
        """
        Хвильовий спектр JONSWAP (Hasselmann та ін., 1973).

        Використовується для Північного моря та інших морських середовищ.
        """
        alpha = 0.0081 * 9.81 ** 2 / (2 * np.pi * peak_frequency) ** 4
        sigma = 0.07 if frequency <= peak_frequency else 0.09

        exp_term = -5 / 4 * (frequency / peak_frequency) ** (-4)
        gamma_term = gamma ** (np.exp(-(frequency - peak_frequency) ** 2 / (2 * sigma ** 2 * peak_frequency ** 2)))

        spectrum = (
            alpha
            * 9.81 ** 2
            / ((2 * np.pi) ** 4 * frequency ** 5)
            * np.exp(-1.25 * (peak_frequency / frequency) ** 4)
            * gamma_term
        )

        return spectrum

    def morison_force(
        self,
        water_particle_velocity: float,
        water_particle_acceleration: float,
        member_diameter: float = 5.0,  # [м]
        member_length: float = 50.0,  # [м]
        cd: float = 1.0,  # Коефіцієнт лобового опору
        cm: float = 1.0,  # Коефіцієнт інерції
        water_density: float = 1025.0,  # [кг/м³]
    ) -> Dict[str, float]:
        """
        Рівняння Морісона для хвильового навантаження на циліндричні елементи.

        F = F_drag + F_inertia
        F_drag = 0.5 * rho * Cd * D * |u| * u
        F_inertia = rho * Cm * A * du/dt

        де:
        u = швидкість частинок води
        du/dt = прискорення частинок води
        D = діаметр елемента
        A = площа поперечного перерізу елемента
        """
        area = np.pi * (member_diameter / 2) ** 2

        # Сила лобового опору
        f_drag = 0.5 * water_density * cd * member_diameter * abs(water_particle_velocity) * water_particle_velocity

        # Сила інерції
        f_inertia = water_density * cm * area * water_particle_acceleration

        # Сумарна сила на одиницю довжини
        f_total = f_drag + f_inertia

        # Сумарна сила на елемент
        f_total_member = f_total * member_length

        return {
            "drag_force_n": f_drag * member_length,
            "inertia_force_n": f_inertia * member_length,
            "total_force_n": f_total_member,
        }

    def current_loading(
        self,
        current_velocity: float = 0.5,  # [м/с]
        member_diameter: float = 5.0,  # [м]
        member_length: float = 50.0,  # [м]
        cd: float = 1.0,
    ) -> float:
        """
        Сила усталеної течії на циліндричний елемент (лише лобовий опір).

        F = 0.5 * rho * Cd * D * v^2
        """
        water_density = 1025.0
        area = member_diameter * member_length

        f_current = 0.5 * water_density * cd * area * (current_velocity ** 2)

        return f_current
