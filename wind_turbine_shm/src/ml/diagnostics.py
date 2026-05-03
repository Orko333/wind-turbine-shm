"""Розширена діагностика дефектів — виявлення конкретних режимів відмов."""

import numpy as np
from scipy import signal as sp_signal
from scipy.fft import fft, fftfreq
from dataclasses import dataclass
from typing import List, Dict


@dataclass
class DefectAnalysis:
    """Результати аналізу дефекту."""
    defect_type: str  # 'healthy', 'crack', 'imbalance', 'foundation_settlement', 'fatigue'
    severity: float  # 0-1, де 1 — критичний
    confidence: float  # 0-1, впевненість прогнозу
    indicators: Dict[str, float]  # Конкретні індикатори для цього дефекту
    recommendations: List[str]  # Рекомендовані дії


class DefectDiagnostics:
    """Багатомодальне виявлення дефектів за допомогою аналізу вібрацій, деформацій та частот."""

    def __init__(self):
        self.baseline_metrics = None

    def _compute_rms(self, signal: np.ndarray) -> float:
        """Обчислює RMS (середньоквадратичне значення) сигналу."""
        return np.sqrt(np.mean(signal ** 2))

    def _compute_crest_factor(self, signal: np.ndarray) -> float:
        """Crest factor = пік / RMS. Високий CF вказує на імпульсні події (тріщини)."""
        return np.max(np.abs(signal)) / (self._compute_rms(signal) + 1e-8)

    def _compute_kurtosis(self, signal: np.ndarray) -> float:
        """Ексцес вказує на негаусівність розподілу. Високий ексцес = тріщини або удари."""
        from scipy.stats import kurtosis
        return kurtosis(signal)

    def _frequency_analysis(
        self, signal: np.ndarray, fs: float = 100.0
    ) -> tuple:
        """Витягує ознаки в частотній області."""
        fft_vals = np.abs(fft(signal))
        freqs = fftfreq(len(signal), 1 / fs)

        # Залишаємо тільки додатні частоти
        positive_freqs = freqs[: len(freqs) // 2]
        positive_fft = fft_vals[: len(fft_vals) // 2]

        return positive_freqs, positive_fft

    def detect_crack(
        self, accel_signal: np.ndarray, fs: float = 100.0
    ) -> Dict[str, float]:
        """
        Виявляє тріщини за імпульсними сигнатурами.
        Тріщини створюють різкі піки → високі crest factor та ексцес.
        """
        rms = self._compute_rms(accel_signal)
        cf = self._compute_crest_factor(accel_signal)
        kurt = self._compute_kurtosis(accel_signal)

        # Пороги, відкаліброваані за літературою
        cf_threshold = 6.0  # Норма < 4, тріщини > 6
        kurt_threshold = 5.0  # Гаусівський розподіл має ексцес ~3

        severity = 0.0
        if cf > cf_threshold:
            severity += 0.6 * min((cf - 4) / 4, 1.0)
        if kurt > kurt_threshold:
            severity += 0.4 * min((kurt - 3) / 5, 1.0)

        return {
            'rms': rms,
            'crest_factor': cf,
            'kurtosis': kurt,
            'severity': min(severity, 1.0),
        }

    def detect_imbalance(
        self, accel_signal: np.ndarray, fs: float = 100.0
    ) -> Dict[str, float]:
        """
        Виявляє дисбаланс ротора за частотою 1P (частота обертання вала).
        Дисбаланс спричиняє високу енергію на частоті 1P.
        """
        freqs, fft_vals = self._frequency_analysis(accel_signal, fs)

        # Очікувана частота 1P для типового ротора 12 об/хв = 0.2 Гц
        # Але реальна швидкість ротора варіюється, тож шукаємо в діапазоні 0.1-2 Гц
        p1_band = (freqs > 0.05) & (freqs < 2.0)
        p1_energy = np.max(fft_vals[p1_band]) if np.any(p1_band) else 0

        # Норма: енергія 1P < 0.5, дисбаланс: > 2.0
        imbalance_severity = min(p1_energy / 2.0, 1.0)

        return {
            'p1_frequency_energy': p1_energy,
            'severity': imbalance_severity,
        }

    def detect_foundation_settlement(
        self, deflection: float, tilt_angle: float
    ) -> Dict[str, float]:
        """
        Виявляє осідання фундаменту за статичним прогином і нахилом.

        Args:
            deflection: Прогин верхівки башти [метри]
            tilt_angle: Кут нахилу башти [градуси]
        """
        # Пороги для башти 100 м
        deflection_threshold = 0.5  # метрів (норма < 0.3 м)
        tilt_threshold = 0.5  # градусів (норма < 0.1°)

        deflection_severity = min(deflection / deflection_threshold, 1.0)
        tilt_severity = min(tilt_angle / tilt_threshold, 1.0)

        severity = 0.6 * deflection_severity + 0.4 * tilt_severity

        return {
            'deflection_m': deflection,
            'tilt_angle_deg': tilt_angle,
            'severity': min(severity, 1.0),
        }

    def detect_fatigue_crack(
        self,
        strain_signal: np.ndarray,
        damage_index: float,
    ) -> Dict[str, float]:
        """
        Виявляє тріщини втоми за сигналом деформацій та накопиченим пошкодженням.
        """
        # Сигнал деформацій має показувати циклічне навантаження
        strain_rms = self._compute_rms(strain_signal)
        strain_peak = np.max(np.abs(strain_signal))

        # Високий індекс пошкодження + великі коливання деформації = ризик тріщини втоми
        severity = 0.7 * damage_index + 0.3 * min(strain_peak / 100.0, 1.0)

        return {
            'strain_rms': strain_rms,
            'strain_peak': strain_peak,
            'damage_index': damage_index,
            'severity': min(severity, 1.0),
        }

    def analyze(
        self,
        accel_signal: np.ndarray,
        strain_signal: np.ndarray = None,
        deflection: float = 0.0,
        tilt_angle: float = 0.0,
        damage_index: float = 0.0,
        fs: float = 100.0,
    ) -> DefectAnalysis:
        """
        Комплексний аналіз дефектів.
        Повертає найбільш вірогідний тип дефекту та його важкість.
        """
        results = {}

        # 1. Виявлення тріщин
        crack_indicators = self.detect_crack(accel_signal, fs)
        results['crack'] = crack_indicators['severity']

        # 2. Виявлення дисбалансу
        imbalance_indicators = self.detect_imbalance(accel_signal, fs)
        results['imbalance'] = imbalance_indicators['severity']

        # 3. Виявлення осідання фундаменту
        if deflection > 0 or tilt_angle > 0:
            settlement_indicators = self.detect_foundation_settlement(
                deflection, tilt_angle
            )
            results['foundation_settlement'] = settlement_indicators['severity']

        # 4. Виявлення тріщин втоми
        if strain_signal is not None:
            fatigue_indicators = self.detect_fatigue_crack(
                strain_signal, damage_index
            )
            results['fatigue_crack'] = fatigue_indicators['severity']

        # Визначаємо домінуючий дефект
        if not results:
            return DefectAnalysis(
                defect_type='healthy',
                severity=0.0,
                confidence=0.9,
                indicators={},
                recommendations=['Continue normal operation. Routine inspection in 6 months.'],
            )

        # Знаходимо дефект з найвищим показником важкості
        defect_type = max(results, key=results.get)
        severity = results[defect_type]
        confidence = 0.7 + 0.3 * severity  # Більша впевненість для серйозніших дефектів

        # Формуємо рекомендації
        recommendations = self._get_recommendations(defect_type, severity)

        return DefectAnalysis(
            defect_type=defect_type,
            severity=severity,
            confidence=confidence,
            indicators=results,
            recommendations=recommendations,
        )

    def _get_recommendations(self, defect_type: str, severity: float) -> List[str]:
        """Формує рекомендації з обслуговування за типом дефекту та його важкістю."""
        recs = {
            'crack': [
                'URGENT: Cracks detected in tower or connections.',
                'Schedule detailed NDT (ultrasonic, eddy current) inspection within 7 days.',
                'Reduce turbine power output by 20% until inspection.',
                'If crack confirmed: plan immediate repair or replacement of component.',
            ],
            'imbalance': [
                'Rotor imbalance detected. This increases bearing wear and vibration.',
                'Perform blade alignment check and balancing within 2 weeks.',
                'Monitor bearing temperatures closely.',
                'If imbalance > 0.8: reduce operating hours until balanced.',
            ],
            'foundation_settlement': [
                'Foundation settlement detected. Structure stability may be compromised.',
                'Conduct geotechnical survey within 30 days.',
                'Monitor tilt and deflection continuously.',
                'If settlement rate > 1mm/month: halt operation and investigate.',
            ],
            'fatigue_crack': [
                'Fatigue damage accumulating. RUL may be significantly reduced.',
                'Increase inspection frequency to every 30 days.',
                'Consider stress relief or component replacement within 90 days.',
                'Adjust operation parameters to reduce cyclic stress.',
            ],
        }

        base_recs = recs.get(defect_type, ['Unknown defect. Consult engineer.'])

        if severity < 0.3:
            return base_recs + ['Severity is LOW. Routine monitoring sufficient.']
        elif severity < 0.6:
            return base_recs + ['Severity is MEDIUM. Plan maintenance within 1 month.']
        else:
            return base_recs + ['⚠️  Severity is HIGH. IMMEDIATE ACTION REQUIRED!']
