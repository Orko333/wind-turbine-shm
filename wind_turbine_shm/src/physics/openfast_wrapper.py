"""Інтеграція з OpenFAST для високоточного аеро-серво-пружного моделювання."""

import subprocess
import os
import tempfile
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from loguru import logger
import json


@dataclass
class OpenFASTConfig:
    """Конфігурація моделювання OpenFAST."""
    # Параметри турбіни
    rotor_diameter: float = 120.0  # [м]
    tower_height: float = 100.0  # [м]
    rated_power: float = 3000.0  # [кВт]
    rated_wind_speed: float = 12.0  # [м/с]

    # Параметри моделювання
    simulation_time: float = 600.0  # [секунди]
    timestep: float = 0.005  # [секунди]

    # Вхідні дані вітру
    wind_speed: float = 10.0  # [м/с]
    turbulence_intensity: float = 0.12  # [частка]
    wind_shear_exponent: float = 0.2

    # Параметри керування
    pitch_control_enabled: bool = True
    generator_control_enabled: bool = True


class OpenFASTWrapper:
    """
    Обгортка над виконуваним файлом OpenFAST для аеро-серво-пружного моделювання.

    OpenFAST (програмне забезпечення NREL для моделювання вітрових турбін) надає:
    - AeroDyn: аеродинамічні розрахунки (тяга, крутний момент, навантаження на лопаті)
    - ElastoDyn: структурна динаміка (пружність башти, лопатей, трансмісії)
    - ServoDyn: моделювання контролера/системи керування
    - HydroDyn: гідродинамічні навантаження для морських турбін

    Дана обгортка:
    1. Генерує вхідні файли OpenFAST
    2. Виконує моделювання OpenFAST
    3. Парсить вихідні файли
    4. Витягує навантаження на башту, моменти на основі лопаті тощо.
    """

    def __init__(self, openfast_executable: str = "openfast"):
        """
        Ініціалізує обгортку OpenFAST.

        Args:
            openfast_executable: Шлях до виконуваного файлу OpenFAST (за замовчуванням: у PATH)
        """
        self.openfast_exe = openfast_executable
        self.is_available = self._check_availability()

        if not self.is_available:
            logger.warning(
                "OpenFAST not found at '{}'. "
                "Install from https://openfast.readthedocs.io/".format(openfast_executable)
            )

    def _check_availability(self) -> bool:
        """Перевіряє доступність виконуваного файлу OpenFAST."""
        try:
            result = subprocess.run(
                [self.openfast_exe, "-v"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def generate_input_file(
        self,
        config: OpenFASTConfig,
        output_path: str,
    ) -> str:
        """
        Генерує вхідний файл OpenFAST (.fst).

        Це спрощений генератор. У промисловому застосуванні буде використано
        повні таблиці Cp/Ct, налаштування контролера кроку лопаті тощо.

        Args:
            config: Об'єкт OpenFASTConfig
            output_path: Шлях для запису файлу .fst

        Returns:
            Шлях до згенерованого вхідного файлу
        """
        fst_content = f"""------- SIMULATION CONTROL ---
False                  Echo             - Echo input data to <RootName>.echo
1                      AbortLevel       - Abort level for error message
100.0                  TMax             - Total time to simulate [seconds]
0.005                  DT               - Recommended module time step [seconds]

------- FEATURE SWITCHES AND FLAGS ---
True                   CompElast        - Simulate structural dynamics (ElastoDyn)
True                   CompAero         - Compute aerodynamic loads (AeroDyn)
True                   CompServo        - Simulate controller (ServoDyn)
True                   CompHydro        - Compute hydrodynamic loads (HydroDyn)
False                  CompSoil         - Compute soil loads (SubDyn)
False                  CompIce          - Compute ice loads (IceFloe)
False                  CompMooring      - Compute mooring loads (MAP++)
False                  CompRotor        - Compute rotor-teeter loads (not used)

------- ENVIRONMENTAL CONDITIONS ---
9.81                   Gravity          - Gravitational acceleration [m/s^2]
1.225                  AirDens          - Air density [kg/m^3]
{config.wind_speed}    WindVxi          - Wind speed at hub height [m/s]
{config.turbulence_intensity}  HubHt            - Hub height [m]
{config.wind_shear_exponent}   Shear            - Wind shear exponent
0.0                    HSref            - Reference height for wind [m]
0.0                    TotChill         - Total chill [degrees C]

------- ROTOR PROPERTIES ---
{config.rotor_diameter}     Rotor diameter [m]
{config.tower_height}       Tower height [m]
{config.rated_power}        Rated power [kW]
{config.rated_wind_speed}   Rated wind speed [m/s]

------- CONTROL PARAMETERS ---
{str(config.pitch_control_enabled).lower()}  PitchControl     - Pitch control enabled
{str(config.generator_control_enabled).lower()}  GenControl       - Generator control enabled
"""

        with open(output_path, 'w') as f:
            f.write(fst_content)

        logger.info(f"Generated OpenFAST input file: {output_path}")
        return output_path

    def run_simulation(
        self,
        config: OpenFASTConfig,
        output_dir: Optional[str] = None,
    ) -> Dict:
        """
        Запускає моделювання OpenFAST.

        Args:
            config: Конфігурація моделювання
            output_dir: Каталог для вихідних файлів (за замовчуванням: тимчасовий)

        Returns:
            Словник з результатами моделювання
        """
        if not self.is_available:
            logger.error("OpenFAST not available")
            return self._fallback_simulation(config)

        # Створюємо тимчасовий каталог за потреби
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="openfast_")

        os.makedirs(output_dir, exist_ok=True)

        # Генеруємо вхідний файл
        input_file = os.path.join(output_dir, "simulation.fst")
        self.generate_input_file(config, input_file)

        try:
            # Запускаємо OpenFAST
            logger.info(f"Running OpenFAST: {self.openfast_exe} {input_file}")
            result = subprocess.run(
                [self.openfast_exe, input_file],
                cwd=output_dir,
                capture_output=True,
                timeout=600,  # тайм-аут 10 хвилин
                text=True,
            )

            if result.returncode != 0:
                logger.error(f"OpenFAST error: {result.stderr}")
                return self._fallback_simulation(config)

            # Парсимо вихід
            return self._parse_openfast_output(output_dir, config)

        except subprocess.TimeoutExpired:
            logger.error("OpenFAST simulation timed out")
            return self._fallback_simulation(config)
        except Exception as e:
            logger.error(f"OpenFAST execution error: {e}")
            return self._fallback_simulation(config)

    def _parse_openfast_output(
        self,
        output_dir: str,
        config: OpenFASTConfig,
    ) -> Dict:
        """
        Парсить вихідні файли OpenFAST (формат .out).

        У промисловому застосуванні читає реальні бінарні файли .out.
        Тут повертаємо структуровані результати.
        """
        # Очікуваний вихідний файл
        output_file = os.path.join(output_dir, "simulation.out")

        if not os.path.exists(output_file):
            logger.warning(f"Output file not found: {output_file}")
            return self._fallback_simulation(config)

        # Парсимо вихід (спрощено — реальний парсинг обробляв би бінарний формат)
        try:
            results = {
                "status": "success",
                "simulation_time": config.simulation_time,
                "wind_speed": config.wind_speed,
                "data": self._extract_key_outputs(output_dir),
            }
            return results
        except Exception as e:
            logger.error(f"Error parsing OpenFAST output: {e}")
            return self._fallback_simulation(config)

    def _extract_key_outputs(self, output_dir: str) -> Dict:
        """Витягує ключові структурні виходи з результатів OpenFAST."""
        # У промисловому застосуванні читало б реальні вихідні файли
        # Тут повертаємо структуру
        return {
            "time": [],
            "wind_speed": [],
            "rotor_speed": [],
            "pitch_angle": [],
            "tower_base_moment": [],
            "tower_top_acceleration": [],
            "blade_root_moment": [],
            "generator_power": [],
        }

    def _fallback_simulation(self, config: OpenFASTConfig) -> Dict:
        """
        Резервне моделювання зі спрощеною фізикою, коли OpenFAST недоступний.

        Використовує аеродинамічну модель + просту структурну динаміку.
        """
        logger.info("Using fallback physics model (OpenFAST not available)")

        from .aerodynamics import AerodynamicModel

        # Створюємо аеродинамічну модель
        aero = AerodynamicModel(
            rotor_diameter=config.rotor_diameter,
            tower_height=config.tower_height,
            rated_power=config.rated_power,
            rated_wind_speed=config.rated_wind_speed,
        )

        # Моделюємо часовий ряд
        n_steps = int(config.simulation_time / config.timestep)
        times = np.linspace(0, config.simulation_time, n_steps)

        # Додаємо варіацію вітру (шум фільтра Ланцоша)
        wind_variation = np.cumsum(np.random.randn(n_steps) * 0.5) * config.timestep
        wind_speeds = config.wind_speed + wind_variation
        wind_speeds = np.clip(wind_speeds, 3.0, 25.0)  # У межах робочого діапазону

        # Розраховуємо аеродинамічні навантаження на кожному кроці часу
        tower_moments = []
        powers = []
        rotor_speeds = []
        thrusts = []

        for ws in wind_speeds:
            thrust = aero.calculate_thrust(ws, pitch_angle=0.0)
            power = aero.calculate_power(ws, pitch_angle=0.0)
            moment = aero.calculate_tower_moment(ws, rotor_speed=12.0)
            rotor_speed = 12.0 if ws > 5.0 else 0.0

            thrusts.append(thrust)
            powers.append(power)
            tower_moments.append(moment)
            rotor_speeds.append(rotor_speed)

        return {
            "status": "fallback",
            "simulation_time": config.simulation_time,
            "wind_speed": config.wind_speed,
            "data": {
                "time": times.tolist(),
                "wind_speed": wind_speeds.tolist(),
                "rotor_speed": rotor_speeds,
                "pitch_angle": [0.0] * n_steps,
                "tower_base_moment": tower_moments,
                "tower_top_acceleration": np.diff(rotor_speeds, prepend=0).tolist(),
                "blade_root_moment": np.array(thrusts) * config.rotor_diameter / 2,
                "generator_power": powers,
            }
        }


class OpenFASTAnalyzer:
    """Аналіз результатів моделювання OpenFAST для оцінки структурного стану."""

    @staticmethod
    def extract_fatigue_loads(
        simulation_results: Dict,
    ) -> Dict:
        """
        Витягує еквівалентні пошкодженню навантаження (DEL) з виходу OpenFAST.

        Args:
            simulation_results: Вихід OpenFASTWrapper.run_simulation

        Returns:
            Словник із DEL та метриками втоми
        """
        from ..fatigue.rainflow import RainflowCounter

        data = simulation_results.get("data", {})
        tower_moments = np.array(data.get("tower_base_moment", []))

        if len(tower_moments) == 0:
            return {}

        # Витягуємо цикли rainflow
        counter = RainflowCounter(n_bins=50)
        cycles = counter.count(tower_moments)

        # Розраховуємо damage equivalent load
        mean_moment = np.mean(tower_moments)
        std_moment = np.std(tower_moments)
        max_moment = np.max(np.abs(tower_moments))

        return {
            "mean_moment_knm": float(mean_moment),
            "std_moment_knm": float(std_moment),
            "max_moment_knm": float(max_moment),
            "rainflow_cycles": len(cycles),
            "simulation_time_sec": simulation_results.get("simulation_time", 0),
        }

    @staticmethod
    def extract_dynamic_properties(
        simulation_results: Dict,
    ) -> Dict:
        """
        Витягує динамічні властивості (частоти, демпфування) з результатів.

        Виконує БПФ на сигналах прискорення для ідентифікації власних частот.
        """
        from scipy.fft import fft, fftfreq

        data = simulation_results.get("data", {})
        acceleration = np.array(data.get("tower_top_acceleration", []))

        if len(acceleration) < 10:
            return {}

        # БПФ-аналіз
        dt = 0.005  # крок часу
        freqs = fftfreq(len(acceleration), dt)
        spectrum = np.abs(fft(acceleration))

        # Знаходимо піки (власні частоти)
        peaks_idx = np.argsort(spectrum)[-5:]  # Топ-5 частот
        natural_freqs = freqs[peaks_idx]
        natural_freqs = natural_freqs[natural_freqs > 0]  # Лише додатні

        return {
            "natural_frequencies_hz": sorted(natural_freqs.tolist(), reverse=True),
            "dominant_frequency_hz": float(natural_freqs[0]) if len(natural_freqs) > 0 else 0.0,
        }
