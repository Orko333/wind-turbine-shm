"""Розширений фільтр Калмана для віртуальних сенсорів цифрового двійника."""

import numpy as np
from dataclasses import dataclass
from typing import Tuple


@dataclass
class KalmanState:
    """Вектор стану цифрового двійника башти."""
    tower_base_moment: float  # [кНм] - оцінений момент біля основи башти
    tower_top_accel: float  # [м/с²] - прискорення на верхівці
    tower_deflection: float  # [м] - оцінене відхилення
    damage_rate: float  # [1/день] - темп накопичення пошкодження


class ExtendedKalmanFilter:
    """
    Розширений фільтр Калмана для оцінки невимірюваних станів башти.

    Фізична модель:
    - Вхід: вимірювання SCADA (швидкість вітру, швидкість ротора, потужність, кут кроку лопаті)
    - Вихід: віртуальні сенсори (момент біля основи, відхилення, темп пошкодження)

    Вектор стану X = [M_base, a_top, deflection, damage_rate]

    Вимірювання Z = [P_wind, n_rotor, P_electrical, a_measured]
    """

    def __init__(self):
        # Стан: [M_base, a_top, deflection, damage_rate]
        self.X = np.array([0.0, 0.0, 0.0, 0.0])

        # Матриця коваріацій (початкова невизначеність)
        self.P = np.eye(4) * 0.1

        # Коваріація шуму процесу (наскільки довіряємо моделі)
        self.Q = np.array(
            [
                [10.0, 0, 0, 0],  # Невизначеність моменту
                [0, 0.1, 0, 0],  # Невизначеність прискорення
                [0, 0, 0.01, 0],  # Невизначеність відхилення
                [0, 0, 0, 0.001],  # Невизначеність темпу пошкодження
            ]
        )

        # Коваріація шуму вимірювань (наскільки довіряємо сенсорам)
        self.R = np.array(
            [
                [5.0, 0, 0, 0],  # Шум вимірювання швидкості вітру
                [0, 2.0, 0, 0],  # Шум швидкості ротора
                [0, 0, 10.0, 0],  # Шум потужності
                [0, 0, 0, 0.01],  # Шум прискорення
            ]
        )

        # Фізичні параметри башти
        self.tower_height = 100.0  # [м]
        self.tower_mass = 500.0  # [тонн]
        self.rotor_diameter = 120.0  # [м]
        self.rated_power = 3.0  # [МВт]

    def _physics_model(
        self,
        wind_speed: float,
        rotor_speed: float,
        pitch_angle: float,
        a_measured: float,
    ) -> np.ndarray:
        """
        Функція переходу стану на основі фізики.
        Прогнозує наступний стан за вхідними даними SCADA.
        """
        # Витягуємо поточний стан
        M_base = self.X[0]
        a_top = self.X[1]
        deflection = self.X[2]
        damage_rate = self.X[3]

        # --- Розрахунок аеродинамічної тяги ---
        # Сила тяги від вітру: F_thrust ≈ 0.5 * ρ * A * v² * Ct
        # де ρ=1.225 кг/м³, A=площа ротора, Ct=коефіцієнт тяги
        air_density = 1.225
        rotor_area = np.pi * (self.rotor_diameter / 2) ** 2
        thrust_coeff = 0.8 * (1 - pitch_angle / 90.0)  # Зменшується зі збільшенням кута кроку
        thrust_force = 0.5 * air_density * rotor_area * (wind_speed ** 2) * thrust_coeff

        # Момент біля основи башти від сили тяги
        M_base_new = thrust_force * self.tower_height / 1000.0  # Переводимо в кНм

        # Прискорення башти (спрощена система другого порядку)
        # damp_coeff = коефіцієнт критичного демпфування
        natural_freq = 0.3  # Гц (типово для великих веж)
        damping_ratio = 0.04  # 4% демпфування
        omega_n = 2 * np.pi * natural_freq

        # d²x/dt² = -(2ζωn)dx/dt - ωn²x + F/m
        # Для дискретного часу (дискретизація 1 Гц):
        dt = 1.0
        a_top_new = (
            -2 * damping_ratio * omega_n * a_top
            - omega_n ** 2 * deflection
            + M_base_new / self.tower_mass
        )

        # Інтегруємо прискорення для отримання відхилення
        deflection_new = deflection + a_measured * dt

        # Темп пошкодження (пропорційно амплітуді моменту)
        damage_rate_new = (
            damage_rate * 0.99 + 0.01 * (np.abs(M_base_new) / 8500.0) * 0.001
        )  # Нормалізоване накопичення пошкодження

        return np.array([M_base_new, a_top_new, deflection_new, damage_rate_new])

    def _measurement_model(self) -> np.ndarray:
        """Перетворює стан на очікувані вимірювання."""
        # Z = [wind_speed_est, rotor_speed_est, power_est, accel_meas]
        # Поки що прогнозуємо прискорення
        M_base = self.X[0]
        a_top = self.X[1]

        # Очікуване прискорення з моменту
        a_expected = a_top
        return np.array([M_base / 1000.0, a_top, M_base * 0.3, a_expected])

    def _jacobian_f(self) -> np.ndarray:
        """Матриця Якобі фізичної моделі (часткові похідні)."""
        # Для спрощеної моделі використовуємо наближену Якобі-матрицю
        jac = np.eye(4)
        jac[0, 0] = 0.98  # Загасання моменту
        jac[1, 1] = 0.95  # Загасання прискорення
        jac[2, 1] = 1.0  # Відхилення з прискорення
        jac[3, 3] = 0.99  # Загасання темпу пошкодження
        return jac

    def _jacobian_h(self) -> np.ndarray:
        """Матриця Якобі моделі вимірювань."""
        return np.array(
            [[0.001, 0, 0, 0], [0, 1.0, 0, 0], [0.3, 0, 0, 0], [0, 1.0, 0, 0]]
        )

    def predict(
        self,
        wind_speed: float,
        rotor_speed: float,
        pitch_angle: float,
        dt: float = 1.0,
    ) -> KalmanState:
        """Крок прогнозу: оцінка наступного стану без вимірювання."""
        # Для кроку прогнозу використовуємо нульове прискорення
        self.X = self._physics_model(wind_speed, rotor_speed, pitch_angle, 0.0)

        # Поширюємо коваріацію: P = F*P*F' + Q
        F = self._jacobian_f()
        self.P = F @ self.P @ F.T + self.Q

        return self._state_to_kalman(self.X)

    def update(
        self,
        z_accel: float,
        z_power: float,
    ) -> KalmanState:
        """Крок оновлення: корекція оцінки за вимірюванням."""
        # Вектор вимірювань
        Z = np.array([0.0, 0.0, z_power, z_accel])

        # Прогнозоване вимірювання
        Z_pred = self._measurement_model()

        # Інновація (нев'язка вимірювання)
        y = Z - Z_pred

        # Коваріація інновації: S = H*P*H' + R
        H = self._jacobian_h()
        S = H @ self.P @ H.T + self.R

        # Підсилення Калмана: K = P*H'*S^-1
        try:
            K = self.P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            K = np.zeros((4, 4))

        # Оновлюємо стан: X = X + K*y
        self.X = self.X + K @ y

        # Оновлюємо коваріацію: P = (I - K*H)*P
        self.P = (np.eye(4) - K @ H) @ self.P

        return self._state_to_kalman(self.X)

    def _state_to_kalman(self, state: np.ndarray) -> KalmanState:
        """Перетворює numpy-масив на дата-клас KalmanState."""
        return KalmanState(
            tower_base_moment=float(state[0]),
            tower_top_accel=float(state[1]),
            tower_deflection=float(state[2]),
            damage_rate=float(state[3]),
        )

    def step(
        self,
        wind_speed: float,
        rotor_speed: float,
        pitch_angle: float,
        z_accel_meas: float,
        z_power: float,
    ) -> KalmanState:
        """Повний крок EKF: прогноз + оновлення."""
        self.predict(wind_speed, rotor_speed, pitch_angle)
        return self.update(z_accel_meas, z_power)

    def get_state(self) -> KalmanState:
        """Повертає поточний оцінений стан."""
        return self._state_to_kalman(self.X)

    def get_uncertainty(self) -> float:
        """Повертає невизначеність оцінки (слід коваріаційної матриці)."""
        return float(np.trace(self.P))
