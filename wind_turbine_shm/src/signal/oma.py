"""Експлуатаційний модальний аналіз (Operational Modal Analysis, OMA) — виявлення та відстеження власних частот."""

import numpy as np
from scipy import signal as sp_signal
from scipy.fft import fft, fftfreq
from dataclasses import dataclass
from typing import Optional, List, Tuple


@dataclass
class ModalData:
    """Результати експлуатаційного модального аналізу."""
    natural_frequencies: List[float]  # Перші N власних частот [Гц]
    amplitudes: List[float]  # Амплітуда на кожній частоті
    damping_ratios: List[float]  # Оцінені коефіцієнти демпфування
    frequency_shift: float  # Відсоткова зміна відносно базового рівня (-5% = деградація)
    health_indicator: float  # 0-1, 1 = здорова конструкція
    is_degraded: bool  # True, якщо зсув частоти перевищує поріг


class OperationalModalAnalyzer:
    """
    Аналізує сигнали вібрацій для виділення власних частот (модальних властивостей).
    Використовується для виявлення структурних пошкоджень (тріщини, послаблення)
    через зсув частот.
    """

    def __init__(
        self,
        fs: float = 100.0,  # Частота дискретизації [Гц]
        fft_size: int = 2048,
        n_modes: int = 3,  # Відстежуємо перші 3 власні частоти
        baseline_freqs: Optional[List[float]] = None,
        freq_shift_threshold: float = -2.0,  # Тривога, якщо частота падає більше ніж на 2%
    ):
        self.fs = fs
        self.fft_size = fft_size
        self.n_modes = n_modes
        self.baseline_freqs = baseline_freqs or []
        self.freq_shift_threshold = freq_shift_threshold  # У відсотках

        # Ковзне середнє для відстеження частот
        self.freq_history = [[] for _ in range(n_modes)]

    def _compute_fft(self, signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Обчислює БПФ сигналу прискорення."""
        # Застосовуємо вікно Ханнінга для зменшення спектрального витоку
        window = sp_signal.hann(len(signal))
        windowed_signal = signal * window

        # Обчислюємо БПФ
        fft_vals = np.abs(fft(windowed_signal, n=self.fft_size))
        freqs = fftfreq(self.fft_size, 1 / self.fs)

        # Залишаємо тільки додатні частоти
        positive_freqs = freqs[: self.fft_size // 2]
        positive_fft = fft_vals[: self.fft_size // 2]

        return positive_freqs, positive_fft

    def _find_peaks(
        self,
        freqs: np.ndarray,
        amplitudes: np.ndarray,
        n_peaks: int = 3,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Знаходить домінантні піки у спектрі частот."""
        # Знаходимо піки з мінімальною відстанню для уникнення дублікатів
        min_distance = int(0.5 * self.fs / (freqs[1] - freqs[0]))  # Мінімальний інтервал 0.5 Гц
        peaks, properties = sp_signal.find_peaks(
            amplitudes,
            height=np.max(amplitudes) * 0.05,  # 5% від максимуму
            distance=min_distance,
        )

        # Сортуємо за амплітудою (спадання)
        sorted_indices = np.argsort(properties["peak_heights"])[::-1]
        top_peaks = peaks[sorted_indices[:n_peaks]]

        # Сортуємо за частотою (зростання)
        top_peaks = np.sort(top_peaks)

        return freqs[top_peaks], amplitudes[top_peaks]

    def _estimate_damping(
        self,
        freqs: np.ndarray,
        amplitudes: np.ndarray,
        peak_freq: float,
    ) -> float:
        """Оцінює коефіцієнт демпфування методом смуги пропускання (точки половинної потужності)."""
        # Знаходимо індекси навколо піка
        peak_idx = np.argmin(np.abs(freqs - peak_freq))
        peak_amp = amplitudes[peak_idx]
        half_power_amp = peak_amp / np.sqrt(2)

        # Знаходимо ліву і праву точки половинної потужності
        left_mask = (freqs < peak_freq) & (amplitudes >= half_power_amp)
        right_mask = (freqs > peak_freq) & (amplitudes >= half_power_amp)

        if not np.any(left_mask) or not np.any(right_mask):
            return 0.05  # Демпфування за замовчуванням

        f_left = np.max(freqs[left_mask])
        f_right = np.min(freqs[right_mask])
        bandwidth = f_right - f_left

        # Коефіцієнт демпфування ζ ≈ BW / (2 * fn)
        damping = bandwidth / (2 * peak_freq)
        return np.clip(damping, 0.001, 0.5)

    def analyze(self, accel_signal: np.ndarray) -> ModalData:
        """
        Виконує експлуатаційний модальний аналіз сигналу прискорення.

        Args:
            accel_signal: Часовий ряд прискорень [м/с²]

        Returns:
            ModalData з власними частотами, демпфуванням та індикатором стану
        """
        # Видаляємо тренд для усунення зсуву DC
        accel_detrended = sp_signal.detrend(accel_signal)

        # Обчислюємо БПФ
        freqs, amplitudes = self._compute_fft(accel_detrended)

        # Знаходимо домінантні піки (власні частоти)
        peak_freqs, peak_amps = self._find_peaks(freqs, amplitudes, self.n_modes)

        # Оцінюємо коефіцієнти демпфування
        damping_ratios = [
            self._estimate_damping(freqs, amplitudes, f) for f in peak_freqs
        ]

        # Зберігаємо в історію для аналізу трендів
        for i, f in enumerate(peak_freqs):
            self.freq_history[i].append(f)
            # Зберігаємо лише останні 100 вимірювань
            if len(self.freq_history[i]) > 100:
                self.freq_history[i].pop(0)

        # Оцінюємо зсув частот відносно базового рівня
        frequency_shift = 0.0
        is_degraded = False

        if self.baseline_freqs:
            # Порівнюємо першу власну частоту з базовим рівнем
            if len(peak_freqs) > 0 and len(self.baseline_freqs) > 0:
                baseline_f1 = self.baseline_freqs[0]
                current_f1 = peak_freqs[0]
                frequency_shift = ((current_f1 - baseline_f1) / baseline_f1) * 100
                is_degraded = frequency_shift < self.freq_shift_threshold

        # Індикатор стану: 1 = здорова, 0 = серйозно деградована
        # На основі зсуву частот (мета: >-5%)
        health_indicator = np.clip(1.0 + (frequency_shift / 10.0), 0.0, 1.0)

        return ModalData(
            natural_frequencies=peak_freqs.tolist(),
            amplitudes=peak_amps.tolist(),
            damping_ratios=damping_ratios,
            frequency_shift=frequency_shift,
            health_indicator=health_indicator,
            is_degraded=is_degraded,
        )

    def set_baseline(self, accel_signal: np.ndarray):
        """Задає базові власні частоти для здорової конструкції."""
        modal_data = self.analyze(accel_signal)
        self.baseline_freqs = modal_data.natural_frequencies
        print(f"Baseline frequencies set: {self.baseline_freqs} Hz")

    def get_frequency_trend(self, n_points: int = 10) -> List[float]:
        """Повертає тренд першої власної частоти (останні N вимірювань)."""
        if not self.freq_history[0]:
            return []
        return self.freq_history[0][-n_points:]
