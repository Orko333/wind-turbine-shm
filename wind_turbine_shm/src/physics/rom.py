"""Моделі зниженого порядку (Reduced Order Models, ROM) для розрахунку напружень FEM у реальному часі."""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, List, Optional, Dict
from scipy.linalg import eigh
from loguru import logger


@dataclass
class TowerProperties:
    """Структурні властивості башти для FEM-моделі."""
    height: float = 100.0  # [м]
    diameter_base: float = 3.5  # [м]
    diameter_top: float = 2.5  # [м]
    thickness: float = 0.035  # [м]
    material_density: float = 7850.0  # [кг/м³] — сталь
    young_modulus: float = 210e9  # [Па]
    damping_ratio: float = 0.05  # [частка]


class TowerFEMModel:
    """
    Спрощена скінченно-елементна модель башти вітрової турбіни.

    Використовує теорію балки Тимошенка з 10 елементами по висоті.
    Видає модальні властивості та коефіцієнти впливу напружень.
    """

    def __init__(self, properties: TowerProperties, n_elements: int = 10):
        """
        Ініціалізує FEM-модель.

        Args:
            properties: Структурні властивості башти
            n_elements: Кількість балкових елементів для дискретизації
        """
        self.props = properties
        self.n_elem = n_elements
        self.n_dof = n_elements + 1  # Вузли

        # Будуємо матриці жорсткості та маси
        self._build_matrices()

        # Обчислюємо модальні властивості
        self._compute_modes()

    def _build_matrices(self):
        """Будує глобальні матриці жорсткості та маси з використанням балкових елементів Тимошенка."""
        K = np.zeros((self.n_dof, self.n_dof))
        M = np.zeros((self.n_dof, self.n_dof))

        # Властивості елемента
        L_elem = self.props.height / self.n_elem
        E = self.props.young_modulus
        rho = self.props.material_density

        # Властивості перерізу зі змінною геометрією (середнє)
        r_avg = (self.props.diameter_base + self.props.diameter_top) / 4
        A = np.pi * r_avg ** 2  # Площа поперечного перерізу
        I = np.pi * r_avg ** 4 / 64  # Момент інерції другого порядку

        # Локальна матриця жорсткості елемента (балка Бернуллі-Ейлера)
        k_local = (E * I / L_elem ** 3) * np.array([
            [12, 6 * L_elem, -12, 6 * L_elem],
            [6 * L_elem, 4 * L_elem ** 2, -6 * L_elem, 2 * L_elem ** 2],
            [-12, -6 * L_elem, 12, -6 * L_elem],
            [6 * L_elem, 2 * L_elem ** 2, -6 * L_elem, 4 * L_elem ** 2],
        ])

        # Локальна матриця маси елемента
        m_local = (rho * A * L_elem / 420) * np.array([
            [140, 70 * L_elem, 70, -70 * L_elem],
            [70 * L_elem, 70 * L_elem ** 2, 70 * L_elem, -70 * L_elem ** 2],
            [70, 70 * L_elem, 140, -70 * L_elem],
            [-70 * L_elem, -70 * L_elem ** 2, -70 * L_elem, 70 * L_elem ** 2],
        ])

        # Збираємо глобальні матриці
        for e in range(self.n_elem):
            dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
            for i, di in enumerate(dofs):
                for j, dj in enumerate(dofs):
                    if di < self.n_dof and dj < self.n_dof:
                        K[di, dj] += k_local[i, j]
                        M[di, dj] += m_local[i, j]

        # Застосовуємо граничні умови (защемлена основа)
        K = K[2:, 2:]
        M = M[2:, 2:]

        self.K = K
        self.M = M

    def _compute_modes(self, n_modes: int = 5):
        """Обчислює власні частоти та форми коливань."""
        # Розв'язуємо узагальнену задачу на власні значення: K*phi = lambda*M*phi
        eigenvalues, eigenvectors = eigh(self.K, self.M)

        # Фільтруємо додатні власні значення
        valid_idx = eigenvalues > 0
        eigenvalues = eigenvalues[valid_idx][:n_modes]
        eigenvectors = eigenvectors[:, valid_idx][:, :n_modes]

        # Власні частоти
        self.frequencies = np.sqrt(eigenvalues) / (2 * np.pi)  # [Гц]

        # Форми коливань
        self.mode_shapes = eigenvectors

        # Коефіцієнти демпфування (демпфування Релея)
        self.damping_ratios = np.full(len(self.frequencies), self.props.damping_ratio)

        logger.info(
            f"FEM computed {len(self.frequencies)} modes. "
            f"Natural frequencies: {self.frequencies[:3]} Hz"
        )

    def get_modal_properties(self) -> Dict:
        """Повертає модальні властивості для ROM."""
        return {
            "frequencies_hz": self.frequencies.tolist(),
            "damping_ratios": self.damping_ratios.tolist(),
            "mode_shapes": self.mode_shapes.tolist(),
        }


class ReducedOrderModel:
    """
    Модель зниженого порядку з використанням редукції в модальному базисі.

    Проєкція повної FEM на підпростір, натягнутий на перші N форм коливань.
    Дозволяє розрахунок напружень у реальному часі без операцій на повних матрицях FEM.
    """

    def __init__(
        self,
        fem_model: TowerFEMModel,
        n_retained_modes: int = 3,
    ):
        """
        Ініціалізує ROM на основі FEM-моделі.

        Args:
            fem_model: Повна FEM-модель
            n_retained_modes: Кількість збережених форм коливань
        """
        self.fem = fem_model
        self.n_modes = n_retained_modes

        # Витягуємо модальний базис
        self.Phi = fem_model.mode_shapes[:, :n_retained_modes]  # Модальний базис

        # Проєктуємо жорсткість і масу на модальний базис: K_r = Phi^T * K * Phi
        self.K_r = self.Phi.T @ fem_model.K @ self.Phi
        self.M_r = self.Phi.T @ fem_model.M @ self.Phi

        # Модальні частоти і демпфування
        self.frequencies = fem_model.frequencies[:n_retained_modes]
        self.damping_ratios = fem_model.damping_ratios[:n_retained_modes]

        logger.info(
            f"ROM created with {n_retained_modes} modes. "
            f"Retained frequencies: {self.frequencies[:2]} Hz"
        )

    def static_response(self, applied_force_base: float) -> Dict:
        """
        Обчислює статичний відгук на прикладену силу біля основи башти.

        Args:
            applied_force_base: Горизонтальна сила біля основи [кН]

        Returns:
            Переміщення башти та напруження
        """
        # Розв'язуємо K_r * q = f_r відносно модальних координат
        f_r = self.Phi.T @ np.array([applied_force_base * 1000, 0, 0, 0, 0, 0])  # Сила в Н

        try:
            q = np.linalg.solve(self.K_r, f_r[:self.n_modes])
        except np.linalg.LinAlgError:
            q = np.linalg.lstsq(self.K_r, f_r[:self.n_modes], rcond=None)[0]

        # Зворотне перетворення у фізичні координати
        displacements = self.Phi @ q

        # Розрахунок розподілу згинального моменту (з кривизни = d²u/dx²)
        # Спрощено: максимальний момент біля основи
        tower_height = self.fem.props.height
        max_moment = applied_force_base * tower_height  # [кНм]

        # Розрахунок напруження за властивостями перерізу
        r_avg = (self.fem.props.height + self.fem.props.diameter_base) / 4
        I = np.pi * r_avg ** 4 / 64  # Другий момент
        y = r_avg  # Відстань від нейтральної осі
        max_stress = (max_moment * 1e6 * y) / I  # [Па]

        return {
            "max_displacement_m": float(np.max(np.abs(displacements))),
            "max_moment_knm": float(max_moment),
            "max_stress_mpa": float(max_stress / 1e6),
            "modal_coordinates": q.tolist(),
        }

    def dynamic_response(
        self,
        force_timeseries: np.ndarray,
        dt: float = 0.005,
        method: str = "newmark",
    ) -> Dict:
        """
        Розв'язує часозалежний динамічний відгук методом інтегрування Ньюмарка.

        Args:
            force_timeseries: Прикладена сила в часі [Н, вектор довжини N_steps]
            dt: Крок часу [секунди]
            method: Метод інтегрування ('newmark' або 'rk4')

        Returns:
            Часовий ряд переміщень, швидкостей, прискорень, напружень
        """
        n_steps = len(force_timeseries)

        # Модальна матриця демпфування: C_r = 2 * zeta * omega * M_r
        C_r = np.zeros((self.n_modes, self.n_modes))
        for i in range(self.n_modes):
            omega_i = 2 * np.pi * self.frequencies[i]
            C_r[i, i] = 2 * self.damping_ratios[i] * omega_i * self.M_r[i, i]

        # Параметри Ньюмарка (середнього прискорення)
        gamma = 0.5
        beta = 0.25

        # Інтегрування за часом
        q = np.zeros((n_steps, self.n_modes))
        dq = np.zeros((n_steps, self.n_modes))
        ddq = np.zeros((n_steps, self.n_modes))

        # Початкові умови
        q[0] = np.zeros(self.n_modes)
        dq[0] = np.zeros(self.n_modes)

        # Ефективна жорсткість
        K_eff = self.K_r + (gamma / (beta * dt)) * C_r + (1 / (beta * dt ** 2)) * self.M_r

        for n in range(n_steps - 1):
            # Права частина
            f_rhs = np.zeros(self.n_modes)
            f_rhs[0] = force_timeseries[n] * 1000  # Сила в Н, проєктована на першу моду

            f_rhs += (1 / (beta * dt ** 2)) * self.M_r @ q[n]
            f_rhs += (1 / (beta * dt)) * self.M_r @ dq[n]
            f_rhs += ((1 - 2 * beta) / (2 * beta)) * self.M_r @ ddq[n]
            f_rhs += (gamma / (beta * dt)) * C_r @ dq[n]
            f_rhs += ((gamma - beta) / beta) * C_r @ ddq[n]

            # Розв'язуємо для прискорення
            try:
                ddq[n + 1] = np.linalg.solve(K_eff, f_rhs)
            except np.linalg.LinAlgError:
                ddq[n + 1] = np.linalg.lstsq(K_eff, f_rhs, rcond=None)[0]

            # Оновлюємо швидкість і переміщення
            dq[n + 1] = dq[n] + dt * ((1 - gamma) * ddq[n] + gamma * ddq[n + 1])
            q[n + 1] = q[n] + dt * dq[n] + (dt ** 2) * ((0.5 - beta) * ddq[n] + beta * ddq[n + 1])

        # Зворотне перетворення у фізичні координати
        displacements = np.array([self.Phi @ q[n] for n in range(n_steps)])
        velocities = np.array([self.Phi @ dq[n] for n in range(n_steps)])
        accelerations = np.array([self.Phi @ ddq[n] for n in range(n_steps)])

        # Максимальні напруження зі згинальних моментів
        max_moments = force_timeseries * self.fem.props.height
        r_avg = (self.fem.props.diameter_base + self.fem.props.diameter_top) / 4
        I = np.pi * r_avg ** 4 / 64
        y = r_avg
        stresses = (max_moments * 1e6 * y) / I / 1e6  # [МПа]

        return {
            "time": np.arange(n_steps) * dt,
            "displacements": np.max(np.abs(displacements), axis=1).tolist(),
            "accelerations": accelerations[:, 0].tolist() if accelerations.shape[1] > 0 else [],
            "stresses_mpa": stresses.tolist(),
            "max_stress_mpa": float(np.max(np.abs(stresses))),
            "max_displacement_m": float(np.max(np.abs(displacements))),
        }

    def get_mrao(
        self,
        frequency_range: Tuple[float, float] = (0.1, 5.0),
        n_points: int = 50,
    ) -> Dict:
        """
        Обчислює модальний оператор амплітудної характеристики (MRAO).

        MRAO показує амплітуду відгуку як функцію частоти збудження.
        Використовується для прогнозування реакції на хвилі, поривчасті вітри тощо.

        Args:
            frequency_range: Діапазон частот [Гц]
            n_points: Кількість точок на кривій MRAO

        Returns:
            Дані MRAO для переміщення і прискорення
        """
        frequencies = np.linspace(frequency_range[0], frequency_range[1], n_points)
        amplitudes = []

        for f_exc in frequencies:
            omega = 2 * np.pi * f_exc

            # Амплітуда відгуку для одиничного збудження силою
            amp = 0.0
            for i in range(self.n_modes):
                omega_i = 2 * np.pi * self.frequencies[i]
                zeta_i = self.damping_ratios[i]

                # Резонансний відгук: A = 1 / (2 * zeta * omega_i * m)
                denominator = ((omega_i ** 2 - omega ** 2) ** 2 +
                               (2 * zeta_i * omega_i * omega) ** 2) ** 0.5
                amp += 1.0 / (self.M_r[i, i] * denominator + 1e-10)

            amplitudes.append(amp)

        return {
            "frequencies_hz": frequencies.tolist(),
            "amplitudes": amplitudes,
            "peak_frequency_hz": float(frequencies[np.argmax(amplitudes)]),
            "peak_amplitude": float(np.max(amplitudes)),
        }


class ROMAnalyzer:
    """Аналіз результатів ROM для моніторингу структурного стану."""

    @staticmethod
    def assess_stress_safety(
        stress_mpa: float,
        yield_strength_mpa: float = 355,
        safety_factor: float = 1.5,
    ) -> Dict:
        """
        Оцінює запас міцності за напруженням.

        Args:
            stress_mpa: Розраховане напруження [МПа]
            yield_strength_mpa: Межа текучості матеріалу [МПа]
            safety_factor: Застосований коефіцієнт безпеки

        Returns:
            Оцінка безпеки
        """
        allowable_stress = yield_strength_mpa / safety_factor
        utilization = stress_mpa / allowable_stress
        safety_margin = (allowable_stress - stress_mpa) / allowable_stress

        status = "safe"
        if utilization > 0.9:
            status = "warning"
        elif utilization > 1.0:
            status = "critical"

        return {
            "stress_mpa": float(stress_mpa),
            "allowable_stress_mpa": float(allowable_stress),
            "utilization_ratio": float(utilization),
            "safety_margin_fraction": float(safety_margin),
            "status": status,
        }

    @staticmethod
    def fatigue_life_estimate(
        stress_timeseries: np.ndarray,
        material_s_n_curve_constant: float = 1e12,
        material_s_n_exponent: float = 3.0,
    ) -> Dict:
        """
        Оцінює ресурс втоми за часовим рядом напружень з використанням кривої S-N.

        Args:
            stress_timeseries: Часовий ряд напружень [МПа]
            material_s_n_curve_constant: Константа кривої S-N (C)
            material_s_n_exponent: Показник кривої S-N (m)

        Returns:
            Оцінка ресурсу втоми
        """
        # Витягуємо цикли rainflow
        from ..fatigue.rainflow import RainflowCounter

        counter = RainflowCounter(n_bins=20)
        cycles = counter.count(stress_timeseries)

        # Розраховуємо пошкодження
        total_damage = 0.0
        for stress_range, count in cycles:
            if stress_range > 0:
                n_f = material_s_n_curve_constant / (stress_range ** material_s_n_exponent)
                total_damage += count / n_f

        # Екстраполюємо до руйнування
        if total_damage > 0:
            years_to_failure = (1.0 / total_damage) / (365 * 24 * 3600)  # Приблизно
        else:
            years_to_failure = 20.0  # Проєктний ресурс

        return {
            "cumulative_damage": float(total_damage),
            "estimated_years_to_failure": float(years_to_failure),
            "rainflow_cycles": len(cycles),
            "status": "safe" if years_to_failure > 20 else "degraded",
        }
