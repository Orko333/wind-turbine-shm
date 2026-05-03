"""
Генератор синтетичних даних SCADA для прогнозування пошкоджень башти вітрової турбіни.

Моделює реалістичні вітрові умови та операційні дані турбіни з використанням:
- розподілу Вейбулла для швидкості вітру (форма k=2, масштаб c=8 м/с)
- спектра турбулентності фон Кармана для пульсацій вітру
- моделі тягової сили: F_T = 0.5 * rho * A * C_T * v^2
- момент згину біля основи башти: M = F_T * H_eff
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional
from loguru import logger


@dataclass
class TurbineParameters:
    """Фізичні параметри еталонної офшорної вітрової турбіни потужністю 2 МВт."""

    rotor_diameter: float = 90.0       # м
    hub_height: float = 100.0          # м
    rated_power_kw: float = 2000.0     # кВт
    rated_wind_speed: float = 12.0     # м/с — номінальна швидкість вітру
    cut_in_speed: float = 3.0          # м/с
    cut_out_speed: float = 25.0        # м/с
    air_density: float = 1.225         # кг/м³
    thrust_coeff: float = 0.75         # C_T за номінальних умов
    tower_stiffness: float = 4.2e9     # Н/м — жорсткість на поперечний згин
    tower_mass: float = 185_000.0      # кг
    nacelle_rotor_mass: float = 130_000.0  # кг (гондола + ротор)
    design_life_years: float = 20.0    # роки

    @property
    def rotor_area(self) -> float:
        return np.pi * (self.rotor_diameter / 2) ** 2

    @property
    def first_eigenfreq(self) -> float:
        """Розрахункова перша власна частота [Гц] (конструкція soft-stiff)."""
        return 0.32


@dataclass
class WeibullWindModel:
    """
    Параметри розподілу швидкості вітру за Вейбуллом.

    Функція щільності ймовірності: f(v) = (k/c) * (v/c)^(k-1) * exp(-(v/c)^k)
    Типово для Північної Європи (офшор): k=2.1, c=9.5 м/с
    """

    shape_k: float = 2.1    # параметр форми Вейбулла
    scale_c: float = 8.0    # параметр масштабу Вейбулла [м/с]
    turbulence_intensity: float = 0.12  # I_T — клас A за МЕК


class SCADADataGenerator:
    """
    Генерує фізично узгоджені синтетичні дані SCADA та високочастотних
    датчиків для системи структурного моніторингу стану башти вітрової турбіни.

    Канали SCADA (10-хвилинна статистика):
      - wind_speed_mean, wind_speed_std
      - rotor_speed_rpm
      - pitch_angle_deg
      - active_power_kw
      - tower_base_moment_kNm   (згин у площині вітру)
      - tower_top_accel_ms2     (у напрямку вітру)
      - nacelle_temperature_degC
      - damage_index            (індекс пошкодження Пальмгрена-Майнера D, справжня мітка)

    Високочастотні канали (вибірка з частотою fs Гц, вікно window_sec секунд):
      - strain_tower_base_microstrain
      - accel_tower_top_ms2
    """

    def __init__(
        self,
        turbine: TurbineParameters = None,
        wind_model: WeibullWindModel = None,
        fs: float = 100.0,
        window_sec: float = 10.0,
        seed: int = 42,
    ) -> None:
        self.turbine = turbine or TurbineParameters()
        self.wind_model = wind_model or WeibullWindModel()
        self.fs = fs
        self.window_sec = window_sec
        self.rng = np.random.default_rng(seed)

    # ------------------------------------------------------------------ #
    #  Моделювання швидкості вітру                                        #
    # ------------------------------------------------------------------ #

    def _simulate_wind_series(self, n_samples: int) -> np.ndarray:
        """
        Генерує часовий ряд середніх швидкостей вітру за розподілом Вейбулла.

        Кожен зразок відповідає одному 10-хвилинному запису SCADA.
        """
        u = self.rng.weibull(self.wind_model.shape_k, size=n_samples)
        return u * self.wind_model.scale_c

    def _turbulence_sigma(self, v_mean: np.ndarray) -> np.ndarray:
        """Стандартне відхилення турбулентності вітру згідно МЕК 61400-1 Вид. 4."""
        I_ref = self.wind_model.turbulence_intensity
        return I_ref * (0.75 * v_mean + 5.6)

    def _thrust_force(self, v: np.ndarray) -> np.ndarray:
        """
        Аеродинамічна тягова сила [Н].

        F_T = 0.5 * rho * A * C_T(v) * v^2

        C_T апроксимується кусково-постійною функцією:
          - нижче номінальної: C_T = C_T_rated
          - вище номінальної: C_T зменшується через керування кутом атаки
        """
        rho = self.turbine.air_density
        A = self.turbine.rotor_area
        v_rated = self.turbine.rated_wind_speed

        C_T = np.where(
            v <= v_rated,
            self.turbine.thrust_coeff,
            self.turbine.thrust_coeff * (v_rated / np.maximum(v, 1e-3)) ** 2,
        )
        # Нульова тяга поза робочим діапазоном
        in_operation = (v >= self.turbine.cut_in_speed) & (v <= self.turbine.cut_out_speed)
        C_T = np.where(in_operation, C_T, 0.0)
        return 0.5 * rho * A * C_T * v ** 2

    def _tower_base_moment(self, F_thrust: np.ndarray, sigma_turbulence: np.ndarray) -> np.ndarray:
        """
        Момент згину біля основи башти у напрямку вітру [кНм].

        M_base = F_T * H_eff + M_turbulence_fluctuation
        H_eff враховує висоту втулки та момент розподіленого навантаження.
        """
        H_eff = self.turbine.hub_height * 0.9   # ефективне плече моменту
        M_mean = F_thrust * H_eff / 1e3         # [кНм]

        # Турбулентність вносить циклічний момент згину
        delta_M = (
            0.5 * self.turbine.air_density
            * self.turbine.rotor_area
            * sigma_turbulence ** 2
            * H_eff / 1e3
            * self.rng.normal(1.0, 0.15, size=F_thrust.shape)
        )
        return M_mean + np.abs(delta_M)

    def _power_curve(self, v: np.ndarray) -> np.ndarray:
        """Апроксимована крива потужності [кВт] за кубічним законом між швидкостями включення та номінальною."""
        v_ci = self.turbine.cut_in_speed
        v_r = self.turbine.rated_wind_speed
        P_r = self.turbine.rated_power_kw

        power = np.where(
            v < v_ci, 0.0,
            np.where(
                v <= v_r,
                P_r * ((v - v_ci) / (v_r - v_ci)) ** 3,
                np.where(v <= self.turbine.cut_out_speed, P_r, 0.0),
            ),
        )
        noise = self.rng.normal(0, 0.02 * P_r, size=v.shape)
        return np.clip(power + noise, 0, P_r)

    def _rotor_speed(self, v: np.ndarray) -> np.ndarray:
        """Швидкість ротора [об/хв] — керування зі змінною швидкістю."""
        v_ci = self.turbine.cut_in_speed
        v_r = self.turbine.rated_wind_speed
        n_rated = 15.0  # об/хв за номінальної потужності
        n_min = 6.0

        rpm = np.where(
            v < v_ci, 0.0,
            np.where(
                v <= v_r,
                n_min + (n_rated - n_min) * (v - v_ci) / (v_r - v_ci),
                n_rated,
            ),
        )
        noise = self.rng.normal(0, 0.3, size=v.shape)
        return np.maximum(rpm + noise, 0)

    def _pitch_angle(self, v: np.ndarray) -> np.ndarray:
        """Кут кроку лопаті [градуси] — 0° нижче номінальної, збільшується вище."""
        v_r = self.turbine.rated_wind_speed
        pitch = np.where(v <= v_r, 0.0, 15.0 * (v - v_r) / (self.turbine.cut_out_speed - v_r))
        return np.clip(pitch + self.rng.normal(0, 0.5, size=v.shape), 0, 90)

    # ------------------------------------------------------------------ #
    #  Моделювання накопиченого пошкодження                               #
    # ------------------------------------------------------------------ #

    def _accumulate_damage(
        self,
        moments_kNm: np.ndarray,
        n_samples: int,
    ) -> np.ndarray:
        """
        Моделює кумулятивний індекс пошкодження за Пальмгреном-Майнером D(t).

        Спрощена швидкість пошкодження пропорційна M^m (m=3 для зварної сталі).
        D нормовано так, що D=1.0 відповідає проектному ресурсу (20 років).
        """
        m_wöhler = 3.0
        # Референсний момент, що спричиняє D=1 за проектний ресурс (константа калібрування)
        M_ref = 50_000.0  # кНм  (відкалібровано для турбіни 2 МВт, проектний ресурс 20 років)
        N_ref = self.turbine.design_life_years * 365 * 24 * 6  # кількість 10-хв відліків за проектний ресурс

        damage_rate = (moments_kNm / M_ref) ** m_wöhler / N_ref
        damage = np.cumsum(damage_rate)
        return damage

    # ------------------------------------------------------------------ #
    #  Моделювання високочастотного сигналу                               #
    # ------------------------------------------------------------------ #

    def generate_hf_window(
        self,
        v_mean: float,
        damage_index: float,
    ) -> dict[str, np.ndarray]:
        """
        Генерує одне високочастотне вікно (window_sec секунд @ fs Гц).

        Повертає словник з ключами 'time', 'strain_microstrain', 'accel_ms2'.
        """
        n = int(self.fs * self.window_sec)
        t = np.linspace(0, self.window_sec, n)

        # Домінуючі частоти: гармоніки 1P та 3P
        rpm = self._rotor_speed(np.array([v_mean]))[0]
        f_1P = rpm / 60.0
        f_3P = 3.0 * f_1P

        # Деформація біля основи башти (мікродеформація) — синусоїда + шум турбулентності
        # Амплітуда деформації масштабується з вітровим навантаженням та пошкодженням (вібрація зростає з пошкодженням)
        M_kNm = self._tower_base_moment(
            self._thrust_force(np.array([v_mean])),
            self._turbulence_sigma(np.array([v_mean])),
        )[0]

        strain_amplitude = M_kNm * 0.8 * (1.0 + 0.5 * damage_index)
        turbulence_noise = self.rng.normal(0, strain_amplitude * 0.3, size=n)

        strain = (
            strain_amplitude * np.sin(2 * np.pi * f_1P * t)
            + 0.3 * strain_amplitude * np.sin(2 * np.pi * f_3P * t + 0.5)
            + turbulence_noise
        )

        # Прискорення на верхівці башти [м/с²]
        # Масштабується з індексом пошкодження: тріщини знижують жорсткість → більша амплітуда
        eigen_freq = self.turbine.first_eigenfreq * (1.0 - 0.15 * damage_index)
        accel_amplitude = 0.5 + 2.5 * (v_mean / 12.0) + 1.5 * damage_index
        accel = (
            accel_amplitude * np.sin(2 * np.pi * eigen_freq * t)
            + 0.5 * accel_amplitude * np.sin(2 * np.pi * f_1P * t + 1.2)
            + self.rng.normal(0, accel_amplitude * 0.2, size=n)
        )

        return {"time": t, "strain_microstrain": strain, "accel_ms2": accel}

    # ------------------------------------------------------------------ #
    #  Публічний інтерфейс                                                #
    # ------------------------------------------------------------------ #

    def generate_scada(
        self,
        n_records: int = 8760,  # 1 рік 10-хвилинних даних
        start_time: Optional[str] = "2023-01-01",
        add_fault_events: bool = True,
    ) -> pd.DataFrame:
        """
        Генерує синтетичний набір даних SCADA.

        Parameters
        ----------
        n_records : int
            Кількість 10-хвилинних записів SCADA для генерації.
        start_time : str
            Початкова мітка часу для індексу.
        add_fault_events : bool
            Якщо True, вставляє дискретні події несправностей/перехідних процесів (аварійні зупинки тощо).

        Returns
        -------
        pd.DataFrame з колонками:
            timestamp, wind_speed_mean, wind_speed_std, rotor_speed_rpm,
            pitch_angle_deg, active_power_kw, tower_base_moment_kNm,
            tower_top_accel_rms, nacelle_temp_degC, damage_index
        """
        logger.info(f"Генерація {n_records} записів SCADA...")

        v_mean = self._simulate_wind_series(n_records)
        sigma_v = self._turbulence_sigma(v_mean)

        F_T = self._thrust_force(v_mean)
        M_base = self._tower_base_moment(F_T, sigma_v)

        damage = self._accumulate_damage(M_base, n_records)

        nacelle_temp = 30.0 + 20.0 * (v_mean / 15.0) + self.rng.normal(0, 2, n_records)

        # СКЗ прискорення масштабується з моментом
        accel_rms = 0.1 + M_base / 200_000 + 0.05 * self.rng.standard_normal(n_records)
        accel_rms = np.abs(accel_rms)

        timestamps = pd.date_range(start=start_time, periods=n_records, freq="10min")

        df = pd.DataFrame(
            {
                "timestamp": timestamps,
                "wind_speed_mean": v_mean,
                "wind_speed_std": sigma_v,
                "rotor_speed_rpm": self._rotor_speed(v_mean),
                "pitch_angle_deg": self._pitch_angle(v_mean),
                "active_power_kw": self._power_curve(v_mean),
                "tower_base_moment_kNm": M_base,
                "tower_top_accel_rms": accel_rms,
                "nacelle_temp_degC": nacelle_temp,
                "damage_index": damage,
            }
        )

        if add_fault_events:
            df = self._inject_fault_events(df)

        logger.info(f"Готово. Діапазон пошкодження: [{damage.min():.4f}, {damage.max():.4f}]")
        return df

    def _inject_fault_events(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Вставляє реалістичні перехідні події в набір даних:
          - Аварійні зупинки (потужність/швидкість → 0 раптово)
          - Події сильних штормів з високою турбулентністю
          - Відмова датчика (NaN)
        """
        n = len(df)
        # Аварійні зупинки — ~3 на рік
        n_stops = max(1, n // 2920)
        stop_idx = self.rng.integers(n // 4, 3 * n // 4, size=n_stops)
        for idx in stop_idx:
            window = min(6, n - idx)
            df.iloc[idx : idx + window, df.columns.get_loc("active_power_kw")] = 0.0
            df.iloc[idx : idx + window, df.columns.get_loc("rotor_speed_rpm")] = 0.0

        # Штормові події — 5% записів, сильний вітер + великий момент
        storm_mask = self.rng.random(n) < 0.05
        df.loc[storm_mask, "wind_speed_mean"] = np.clip(
            df.loc[storm_mask, "wind_speed_mean"] * 1.6, 0, 32
        )
        df.loc[storm_mask, "tower_base_moment_kNm"] *= 2.1

        # Відмова датчика — 1% NaN у каналі прискорення
        dropout_mask = self.rng.random(n) < 0.01
        df.loc[dropout_mask, "tower_top_accel_rms"] = np.nan

        return df

    def generate_hf_dataset(
        self,
        scada_df: pd.DataFrame,
        max_windows: int = 500,
    ) -> pd.DataFrame:
        """
        Генерує вікна високочастотних сигналів, зіставлені із записами SCADA.

        Повертає DataFrame з одним рядком на HF-вікно; включає статистичні
        ознаки (СКЗ, ексцес, пік-фактор) та справжню мітку пошкодження.
        """
        logger.info(f"Генерація до {max_windows} HF-вікон...")
        indices = self.rng.choice(len(scada_df), size=min(max_windows, len(scada_df)), replace=False)

        rows = []
        for i in indices:
            row = scada_df.iloc[i]
            v_mean = row["wind_speed_mean"]
            d_idx = row["damage_index"]

            hf = self.generate_hf_window(float(v_mean), float(d_idx))
            strain = hf["strain_microstrain"]
            accel = hf["accel_ms2"]

            rows.append(
                {
                    "timestamp": row["timestamp"],
                    "wind_speed_mean": v_mean,
                    "damage_index": d_idx,
                    "damage_class": self._damage_class(d_idx),
                    # Ознаки деформації
                    "strain_rms": float(np.sqrt(np.mean(strain ** 2))),
                    "strain_peak": float(np.max(np.abs(strain))),
                    "strain_kurtosis": float(
                        np.mean((strain - strain.mean()) ** 4) / (strain.std() ** 4 + 1e-10)
                    ),
                    "strain_crest_factor": float(
                        np.max(np.abs(strain)) / (np.sqrt(np.mean(strain ** 2)) + 1e-10)
                    ),
                    # Ознаки прискорення
                    "accel_rms": float(np.sqrt(np.mean(accel ** 2))),
                    "accel_peak": float(np.max(np.abs(accel))),
                    "accel_kurtosis": float(
                        np.mean((accel - accel.mean()) ** 4) / (accel.std() ** 4 + 1e-10)
                    ),
                    # Зберігаємо сирі сигнали у вигляді списків для подальшої обробки
                    "strain_signal": strain.tolist(),
                    "accel_signal": accel.tolist(),
                }
            )

        logger.info(f"Згенеровано {len(rows)} HF-вікон.")
        return pd.DataFrame(rows)

    @staticmethod
    def _damage_class(d: float) -> int:
        """Відображає неперервний індекс пошкодження на мітку 3 класів: 0=Справний, 1=Попередження, 2=Критичний."""
        if d < 0.3:
            return 0
        if d < 0.7:
            return 1
        return 2
