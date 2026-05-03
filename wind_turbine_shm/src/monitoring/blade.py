"""Моніторинг лопатей — виявлення ерозії, обледеніння та дисбалансу."""

import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional
from scipy import signal as sp_signal
from scipy.fft import fft, fftfreq
from loguru import logger


@dataclass
class BladeCondition:
    """Результати оцінки стану лопаті."""
    blade_id: str
    erosion_severity: float  # 0-1
    ice_buildup_severity: float  # 0-1
    imbalance_severity: float  # 0-1
    overall_health: float  # 0-1, 1=ідеальний стан
    recommendations: List[str]
    alert_level: str  # 'healthy', 'warning', 'critical'


class BladeMonitoring:
    """Багатомодальний моніторинг стану лопатей."""

    def __init__(self, num_blades: int = 3, rotor_rpm: float = 12.0):
        self.num_blades = num_blades
        self.rotor_rpm = rotor_rpm
        self.blade_history: Dict[str, List[Dict]] = {}

    def _compute_blade_pass_frequency(self) -> float:
        """Розраховує частоту проходу лопаті (BPF = N * частота вала)."""
        shaft_freq = self.rotor_rpm / 60  # Переводимо об/хв у Гц
        bpf = self.num_blades * shaft_freq
        return bpf

    def detect_erosion(
        self,
        vibration_signal: np.ndarray,
        fs: float = 100.0,
    ) -> Dict[str, float]:
        """
        Виявляє ерозію лопаті за вмістом високочастотного шуму.

        Ерозія створює шорсткість поверхні → підвищена високочастотна енергія.
        Моніторимо вміст HF-прискорень (смуга 5-20 кГц).
        """
        # Застосовуємо фільтр високих частот для виділення ознак ерозії
        try:
            from scipy.signal import butter, filtfilt
            # Баттерворт ВЧ на 5 кГц (якщо доступно)
            b, a = butter(4, 5000, btype='high', analog=True)
            hf_signal = filtfilt(b, a, vibration_signal[:1000] if len(vibration_signal) > 1000 else vibration_signal)
        except Exception:
            # Резервний варіант: просте виділення високих частот
            hf_signal = vibration_signal

        # Енергія у високочастотній смузі
        psd = np.abs(fft(hf_signal)) ** 2
        hf_energy = np.sum(psd) / len(psd)

        # Нормалізація відносно низькочастотної енергії
        lf_energy = np.mean(vibration_signal ** 2)
        erosion_ratio = hf_energy / (lf_energy + 1e-8)

        # Пороги: норма < 0.1, помірно 0.1-0.3, серйозно > 0.3
        if erosion_ratio < 0.1:
            severity = 0.0
        elif erosion_ratio < 0.3:
            severity = (erosion_ratio - 0.1) / 0.2
        else:
            severity = min(1.0, erosion_ratio / 0.3)

        return {
            'hf_energy': float(hf_energy),
            'erosion_ratio': float(erosion_ratio),
            'severity': float(severity),
        }

    def detect_ice_buildup(
        self,
        power_output: float,
        wind_speed: float,
        temperature_c: float,
        rotor_speed: float,
        baseline_power_curve: Optional[np.ndarray] = None,
    ) -> Dict[str, float]:
        """
        Виявляє накопичення льоду на лопатях за дефіцитом потужності.

        Лід збільшує опір, знижує аеродинамічну ефективність → нижча потужність за того ж вітру.
        Також: зростання вібрації, зниження швидкості ротора.
        """
        # Очікувана потужність за цієї швидкості вітру (крива потужності)
        # Проста модель: P = 0.5 * rho * A * v³ * Cp
        # Припускаємо Cp ~0.4 для сучасних турбін
        expected_power = 0.001 * (wind_speed ** 3) * 3000  # Масштабовано для турбіни 3 МВт

        power_deficit = expected_power - power_output
        deficit_ratio = abs(power_deficit) / (expected_power + 1e-8)

        # Дефіцит швидкості ротора
        expected_rpm = 12.0 if wind_speed > 5 else 12.0 * (wind_speed / 5)
        rpm_deficit = (expected_rpm - rotor_speed) / (expected_rpm + 1e-8)

        # Індикатори навколишнього середовища
        icing_probable = temperature_c < 5.0 and wind_speed > 5.0

        # Поєднуємо індикатори
        severity = 0.0
        if deficit_ratio > 0.05:  # 5% втрати потужності
            severity += 0.4 * min(deficit_ratio / 0.2, 1.0)
        if rpm_deficit > 0.03:  # 3% втрати об/хв
            severity += 0.3 * min(rpm_deficit / 0.1, 1.0)
        if icing_probable:
            severity += 0.3

        severity = min(1.0, severity)

        return {
            'power_deficit_ratio': float(deficit_ratio),
            'rpm_deficit_ratio': float(rpm_deficit),
            'temperature_c': float(temperature_c),
            'icing_probable': bool(icing_probable),
            'severity': float(severity),
        }

    def detect_imbalance(
        self,
        vibration_x: np.ndarray,
        vibration_y: np.ndarray,
        fs: float = 100.0,
    ) -> Dict[str, float]:
        """
        Виявляє дисбаланс лопатей за енергією на частоті 1P.

        Дисбаланс створює періодичне збурення на частоті 1× від обертання ротора (1P).
        Проявляється як синхронна вібрація в радіальному напрямку.
        """
        bpf = self._compute_blade_pass_frequency()
        p1_freq = bpf / self.num_blades  # Частота 1P

        # Обчислюємо БПФ
        freqs_x = fftfreq(len(vibration_x), 1 / fs)
        fft_x = np.abs(fft(vibration_x))

        freqs_y = fftfreq(len(vibration_y), 1 / fs)
        fft_y = np.abs(fft(vibration_y))

        # Знаходимо енергію на 1P
        p1_band = (np.abs(freqs_x) > p1_freq - 0.1) & (np.abs(freqs_x) < p1_freq + 0.1)
        p1_energy_x = np.max(fft_x[p1_band]) if np.any(p1_band) else 0

        p1_band_y = (np.abs(freqs_y) > p1_freq - 0.1) & (np.abs(freqs_y) < p1_freq + 0.1)
        p1_energy_y = np.max(fft_y[p1_band_y]) if np.any(p1_band_y) else 0

        # Сумарна енергія на 1P
        p1_energy = np.sqrt(p1_energy_x ** 2 + p1_energy_y ** 2)

        # Загальна вібрація
        rms_x = np.sqrt(np.mean(vibration_x ** 2))
        rms_y = np.sqrt(np.mean(vibration_y ** 2))
        total_rms = np.sqrt(rms_x ** 2 + rms_y ** 2)

        # Співвідношення 1P
        p1_ratio = p1_energy / (total_rms + 1e-8)

        # Пороги: норма < 0.2, дисбаланс > 0.5
        if p1_ratio < 0.2:
            severity = 0.0
        elif p1_ratio < 0.5:
            severity = (p1_ratio - 0.2) / 0.3
        else:
            severity = min(1.0, p1_ratio / 0.5)

        return {
            'p1_frequency_hz': float(p1_freq),
            'p1_energy': float(p1_energy),
            'p1_ratio': float(p1_ratio),
            'rms_total': float(total_rms),
            'severity': float(severity),
        }

    def analyze_blade(
        self,
        blade_id: str,
        vibration_x: np.ndarray,
        vibration_y: np.ndarray,
        power_output: float,
        wind_speed: float,
        temperature_c: float,
        rotor_speed: float,
        fs: float = 100.0,
    ) -> BladeCondition:
        """
        Комплексний аналіз стану лопаті.

        Поєднує виявлення ерозії, льоду та дисбалансу.
        """
        # Запускаємо всі детектори
        erosion = self.detect_erosion(vibration_x, fs)
        ice = self.detect_ice_buildup(power_output, wind_speed, temperature_c, rotor_speed)
        imbalance = self.detect_imbalance(vibration_x, vibration_y, fs)

        # Загальний стан (обернене до максимальної важкості)
        max_severity = max(
            erosion['severity'],
            ice['severity'],
            imbalance['severity'],
        )
        overall_health = 1.0 - max_severity

        # Визначаємо рівень тривоги
        if max_severity < 0.3:
            alert_level = 'healthy'
        elif max_severity < 0.6:
            alert_level = 'warning'
        else:
            alert_level = 'critical'

        # Формуємо рекомендації
        recommendations = self._generate_recommendations(blade_id, erosion, ice, imbalance)

        # Зберігаємо історію
        if blade_id not in self.blade_history:
            self.blade_history[blade_id] = []

        self.blade_history[blade_id].append({
            'timestamp': str(np.datetime64('now')),
            'erosion_severity': erosion['severity'],
            'ice_severity': ice['severity'],
            'imbalance_severity': imbalance['severity'],
        })

        return BladeCondition(
            blade_id=blade_id,
            erosion_severity=erosion['severity'],
            ice_buildup_severity=ice['severity'],
            imbalance_severity=imbalance['severity'],
            overall_health=overall_health,
            recommendations=recommendations,
            alert_level=alert_level,
        )

    def _generate_recommendations(
        self,
        blade_id: str,
        erosion: Dict,
        ice: Dict,
        imbalance: Dict,
    ) -> List[str]:
        """Формує рекомендації з технічного обслуговування."""
        recs = []

        if erosion['severity'] > 0.5:
            recs.append(f"⚠️  {blade_id}: Severe blade erosion detected. Schedule blade refurbishment within 30 days.")
        elif erosion['severity'] > 0.3:
            recs.append(f"{blade_id}: Moderate erosion observed. Plan restoration coating application.")

        if ice['severity'] > 0.6:
            recs.append(f"🧊 {blade_id}: Ice accumulation detected. Reduce power or shut down if ambient <0°C.")
        elif ice['icing_probable']:
            recs.append(f"{blade_id}: Conditions favor icing. Monitor blade heating system.")

        if imbalance['severity'] > 0.5:
            recs.append(f"⚠️  {blade_id}: Blade imbalance detected. Balance blades immediately to reduce fatigue.")
        elif imbalance['severity'] > 0.3:
            recs.append(f"{blade_id}: Minor imbalance noted. Schedule balancing at next maintenance.")

        if not recs:
            recs.append(f"{blade_id}: Blade condition is healthy. Continue routine monitoring.")

        return recs

    def get_fleet_blade_status(self) -> Dict[str, Dict]:
        """Повертає стан здоров'я всіх відстежуваних лопатей."""
        summary = {}

        for blade_id, history in self.blade_history.items():
            if not history:
                continue

            latest = history[-1]
            avg_erosion = np.mean([h['erosion_severity'] for h in history[-10:]])
            avg_ice = np.mean([h['ice_severity'] for h in history[-10:]])
            avg_imbalance = np.mean([h['imbalance_severity'] for h in history[-10:]])

            summary[blade_id] = {
                'erosion_severity': float(avg_erosion),
                'ice_buildup_severity': float(avg_ice),
                'imbalance_severity': float(avg_imbalance),
                'trend': 'stable' if len(history) < 2 else (
                    'improving' if history[-1]['erosion_severity'] < history[-2]['erosion_severity']
                    else 'degrading'
                ),
            }

        return summary
