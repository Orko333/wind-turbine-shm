"""Моделювання ефектів сліду для вітрових ферм — аеродинамічна взаємодія турбін між собою."""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, List, Dict
from loguru import logger


@dataclass
class TurbinePosition:
    """Положення турбіни на вітровій фермі (координати x, y у діаметрах ротора)."""
    turbine_id: str
    x: float  # Easting [у діаметрах ротора]
    y: float  # Northing [у діаметрах ротора]


class WakeDeficit:
    """
    Модель дефіциту швидкості вітру у сліді розташованої вище за потоком турбіни.

    Турбіна прискорює повітря на роторі та сповільнює його за ним,
    створюючи зону дефіциту (слід) зі зменшеною швидкістю вітру і підвищеною
    турбулентністю. Турбіни нижче за потоком зазнають обох ефектів,
    що значно збільшує втомні навантаження.

    Теорія:
    -------
    Модель Парка (1992) з гаусівським профілем сліду:

      v_wake(r) = v_0 * (1 - (2*a) / (1 + (x/D/k)^2) * exp(-0.05*(y/D/(x/D/k))^2))

    де:
      v_0 = швидкість вітру у вільному потоці
      a = коефіцієнт осьової індукції
      x = відстань нижче за потоком [м]
      y = радіальна відстань від центру сліду [м]
      D = діаметр ротора [м]
      k = константа загасання сліду ≈ 0.05
    """

    def __init__(
        self,
        rotor_diameter: float = 120.0,
        wake_decay_constant: float = 0.05,
    ):
        """
        Args:
            rotor_diameter: Діаметр ротора турбіни [м]
            wake_decay_constant: Швидкість розсіювання сліду (k_w ≈ 0.05 на суші, 0.02 у морі)
        """
        self.D = rotor_diameter
        self.k_w = wake_decay_constant

    def wind_speed_deficit(
        self,
        freestream_speed: float,
        downstream_distance: float,
        radial_distance: float,
        induction_factor: float = 0.33,
    ) -> float:
        """
        Розраховує швидкість вітру в точці всередині сліду.

        Args:
            freestream_speed: Незбурена швидкість вітру [м/с]
            downstream_distance: Відстань за вітроверхньою турбіною [м]
            radial_distance: Відстань від центру сліду [м]
            induction_factor: Осьова індукція (зазвичай 0.3-0.35)

        Returns:
            Швидкість вітру в точці [м/с]
        """
        if downstream_distance <= 0:
            return freestream_speed

        # Нормалізуємо відстані
        x_d = downstream_distance / self.D  # Відстань нижче за потоком у діаметрах
        y_d = radial_distance / self.D      # Радіальна відстань у діаметрах

        # Радіус сліду в позиції x
        wake_radius_factor = 1.0 + self.k_w * x_d

        # Розрахунок дефіциту
        a = induction_factor
        deficit = (2 * a) / (wake_radius_factor ** 2)
        gaussian = np.exp(-0.05 * (y_d / wake_radius_factor) ** 2)

        speed_deficit = deficit * gaussian
        reduced_speed = freestream_speed * (1.0 - speed_deficit)

        return max(reduced_speed, 0.0)

    def wake_center_speed(
        self,
        freestream_speed: float,
        downstream_distance: float,
    ) -> float:
        """Швидкість вітру в центрі сліду (найгірший випадок для вітронижньої турбіни)."""
        return self.wind_speed_deficit(
            freestream_speed,
            downstream_distance,
            radial_distance=0.0,  # У центрі
        )

    def turbulence_intensification(
        self,
        background_turbulence: float,
        downstream_distance: float,
        radial_distance: float,
        deficit: float,
    ) -> float:
        """
        Розраховує підвищену інтенсивність турбулентності у сліді.

        Турбулентність сліду суттєво підвищена через зсув і змішування потоків.

        Модель:
          I_wake ≈ I_0 + 0.05 * (deficit) * (1 - x/D)^0.5

        де I_0 — фонова турбулентність.
        """
        if downstream_distance <= 0:
            return background_turbulence

        x_d = downstream_distance / self.D

        # Додаткова турбулентність через зсув у сліді
        added_turb = 0.05 * deficit * max(0, (1.0 - x_d) ** 0.5)

        return background_turbulence + added_turb


class WakeCombination:
    """
    Суперпозиція слідів від декількох вітроверхніх турбін.

    Коли декілька турбін розташовані вище за потоком, їхні сліди можуть перекриватись.
    Комбіновану швидкість вітру зазвичай моделюють векторною сумою
    або корінь-сумою-квадратів окремих дефіцитів.
    """

    @staticmethod
    def vector_sum_deficit(
        individual_deficits: List[float],
    ) -> float:
        """
        Об'єднує дефіцити векторним підсумовуванням (квадратурою).

        Більш реалістичний варіант для перекриваних слідів:
          Total_deficit = sqrt(sum(deficit_i^2))
        """
        sum_sq = sum(d ** 2 for d in individual_deficits)
        return np.sqrt(sum_sq)

    @staticmethod
    def arithmetic_sum_deficit(
        individual_deficits: List[float],
    ) -> float:
        """
        Проста арифметична сума (консервативне завищення).

        Це надмірно консервативно, але просто:
          Total_deficit = sum(deficit_i)
        """
        return sum(individual_deficits)

    @staticmethod
    def combined_wind_speed(
        freestream_speed: float,
        individual_deficits: List[float],
        method: str = "quadrature",
    ) -> float:
        """
        Розраховує комбіновану швидкість вітру за наявності кількох слідів.

        Args:
            freestream_speed: Незбурений вітер [м/с]
            individual_deficits: Список дефіцитів швидкості від кожної вітроверхньої турбіни [м/с]
            method: "quadrature" (реалістичний) або "arithmetic" (консервативний)

        Returns:
            Комбінована швидкість вітру [м/с]
        """
        if method == "quadrature":
            total_deficit = WakeCombination.vector_sum_deficit(individual_deficits)
        else:
            total_deficit = WakeCombination.arithmetic_sum_deficit(individual_deficits)

        return freestream_speed - total_deficit


class WindFarmLayout:
    """
    Керує планом вітрової ферми та обчислює міжтурбінну взаємодію.

    За положеннями всіх турбін і напрямком вітру обчислює, як кожна
    турбіна впливає на інші, та оцінює скориговані швидкості вітру для розрахунку навантажень.
    """

    def __init__(
        self,
        turbines: List[TurbinePosition],
        rotor_diameter: float = 120.0,
    ):
        """
        Args:
            turbines: Список об'єктів TurbinePosition
            rotor_diameter: Загальний діаметр ротора [м]
        """
        self.turbines = {t.turbine_id: t for t in turbines}
        self.D = rotor_diameter
        self.wake_model = WakeDeficit(rotor_diameter)

    def get_downstream_turbines(
        self,
        upwind_id: str,
        wind_direction_deg: float,
        threshold_distance: float = 10.0,  # у діаметрах ротора
    ) -> List[Tuple[str, float]]:
        """
        Знаходить турбіни нижче за потоком від заданої турбіни.

        Args:
            upwind_id: Ідентифікатор вітроверхньої турбіни
            wind_direction_deg: Напрямок вітру [градуси], 0° = Північ, 90° = Схід
            threshold_distance: Максимальна відстань для розгляду [у діаметрах ротора]

        Returns:
            Список (downwind_turbine_id, distance_in_diameters)
        """
        upwind = self.turbines[upwind_id]
        wind_rad = np.radians(wind_direction_deg)

        # Одиничний вектор напрямку поширення вітру
        dx = np.sin(wind_rad)
        dy = np.cos(wind_rad)

        downwind = []

        for turbine_id, turbine in self.turbines.items():
            if turbine_id == upwind_id:
                continue

            # Вектор від вітроверхньої до цієї турбіни
            delta_x = turbine.x - upwind.x
            delta_y = turbine.y - upwind.y

            # Проєктуємо на напрямок вітру
            along_wind = delta_x * dx + delta_y * dy
            cross_wind = -delta_x * dy + delta_y * dx

            # Чи дійсно нижче за потоком?
            if along_wind > 0:
                distance_diameters = along_wind / self.D
                if distance_diameters <= threshold_distance:
                    downwind.append((turbine_id, distance_diameters, cross_wind))

        return downwind

    def calculate_wind_speed_with_wake(
        self,
        turbine_id: str,
        freestream_speed: float,
        wind_direction_deg: float,
        turbulence_intensity: float = 0.12,
    ) -> Dict[str, float]:
        """
        Обчислює ефективну швидкість вітру на турбіні з урахуванням ефектів сліду.

        Args:
            turbine_id: Ідентифікатор цільової турбіни
            freestream_speed: Незбурена (на рівні ферми) швидкість вітру [м/с]
            wind_direction_deg: Напрямок вітру [градуси]
            turbulence_intensity: Фонова турбулентність [0-1]

        Returns:
            {
                'wind_speed': ефективна швидкість вітру [м/с],
                'wind_speed_deficit': сумарний дефіцит [м/с],
                'turbulence_intensity': підвищена турбулентність,
                'num_upwind_turbines': кількість вітроверхніх джерел,
            }
        """
        target = self.turbines[turbine_id]

        # Знаходимо всі вітроверхні турбіни, що впливають на дану
        upwind_turbines = []
        for up_id, distance_d, cross_wind_d in self.get_downstream_turbines(
            turbine_id, wind_direction_deg + 180
        ):
            upwind_turbines.append((up_id, distance_d, cross_wind_d))

        # Розраховуємо дефіцит від кожної вітроверхньої турбіни
        individual_deficits = []
        added_turbulence = 0.0

        for up_id, distance_d, cross_wind_d in upwind_turbines:
            distance_m = distance_d * self.D
            cross_wind_m = cross_wind_d * self.D

            deficit = freestream_speed - self.wake_model.wind_speed_deficit(
                freestream_speed,
                downstream_distance=distance_m,
                radial_distance=abs(cross_wind_m),
            )
            individual_deficits.append(deficit)

            # Підвищення турбулентності
            added_turb = self.wake_model.turbulence_intensification(
                turbulence_intensity,
                distance_m,
                abs(cross_wind_m),
                deficit,
            ) - turbulence_intensity
            added_turbulence += added_turb

        # Комбінуємо сліди
        if individual_deficits:
            combined_speed = WakeCombination.combined_wind_speed(
                freestream_speed,
                individual_deficits,
                method="quadrature",
            )
            total_deficit = freestream_speed - combined_speed
        else:
            combined_speed = freestream_speed
            total_deficit = 0.0

        effective_turbulence = turbulence_intensity + added_turbulence

        return {
            "wind_speed": combined_speed,
            "wind_speed_deficit": total_deficit,
            "turbulence_intensity": effective_turbulence,
            "num_upwind_turbines": len(upwind_turbines),
        }

    def report_farm_efficiency(
        self,
        freestream_speed: float,
        wind_direction_deg: float,
    ) -> Dict[str, Dict]:
        """
        Генерує звіт про вплив на швидкість вітру по всій фермі.

        Повертає швидкості вітру на кожній турбіні для заданого напрямку.
        """
        report = {}

        for turbine_id in self.turbines:
            result = self.calculate_wind_speed_with_wake(
                turbine_id,
                freestream_speed,
                wind_direction_deg,
            )
            report[turbine_id] = result

        return report
