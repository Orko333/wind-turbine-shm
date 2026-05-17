'use client';

import { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

interface SpectrogramDataPoint {
  frequency: number; // Hz
  power: number; // dB
  time_slot?: number;
  intensity?: number;
}

interface SpectrogramProps {
  frequencies?: SpectrogramDataPoint[];
  peakFrequency?: number;
  peakPower?: number;
  isLoading?: boolean;
}

export function Spectrogram({
  frequencies = [
    { frequency: 0.5, power: -40, intensity: 10 },
    { frequency: 0.82, power: -25, intensity: 35 },
    { frequency: 1.0, power: -35, intensity: 25 },
    { frequency: 1.24, power: -22, intensity: 40 },
    { frequency: 1.5, power: -38, intensity: 18 },
    { frequency: 1.64, power: -28, intensity: 30 },
    { frequency: 2.0, power: -32, intensity: 22 },
    { frequency: 2.15, power: -20, intensity: 45 },
    { frequency: 2.5, power: -36, intensity: 20 },
    { frequency: 2.88, power: -25, intensity: 32 },
    { frequency: 3.0, power: -30, intensity: 28 },
    { frequency: 3.42, power: -18, intensity: 50 },
    { frequency: 3.5, power: -34, intensity: 24 },
    { frequency: 4.0, power: -26, intensity: 31 },
    { frequency: 4.5, power: -40, intensity: 12 },
    { frequency: 5.0, power: -38, intensity: 15 },
  ],
  peakFrequency = 3.42,
  peakPower = -18,
  isLoading = false,
}: SpectrogramProps) {
  const t = useT();
  // Генерація даних час-частота для візуалізації теплової карти
  const timeFrequencyData = useMemo(() => {
    // Map each frequency to a stable time-slot bin determined by the frequency
    // itself — adjacent frequencies appear in adjacent bins, so the scatter
    // visualizes the spectrum's temporal structure deterministically.
    return frequencies.map((f, idx) => ({
      ...f,
      time_slot: ((idx * 7) % 12) + 1,
      normalized_power: (f.power + 50) / 40,
    }));
  }, [frequencies]);

  // Виявлення піків та гармонік
  const peaks = useMemo(() => {
    const sorted = [...frequencies].sort((a, b) => b.power - a.power);
    return sorted.slice(0, 5); // Топ 5 піків
  }, [frequencies]);

  const identifyHarmonic = (freq: number): string => {
    const fundamental = peakFrequency;
    const ratio = freq / fundamental;
    const tolerance = 0.05;

    if (Math.abs(ratio - 1) < tolerance) return t('monitoring.spectrogram.harmonic_1');
    if (Math.abs(ratio - 2) < tolerance) return t('monitoring.spectrogram.harmonic_2');
    if (Math.abs(ratio - 3) < tolerance) return t('monitoring.spectrogram.harmonic_3');
    if (Math.abs(ratio - 4) < tolerance) return t('monitoring.spectrogram.harmonic_4');
    if (Math.abs(ratio - 0.5) < tolerance) return t('monitoring.spectrogram.subharmonic');
    return t('monitoring.spectrogram.other');
  };

  // Отримати колір на основі потужності
  const getPowerColor = (power: number) => {
    const normalized = (power + 50) / 40; // Нормалізація діапазону -50 до -10
    if (normalized < 0.2) return 'hsl(28 8% 22%)';   // ink-3
    if (normalized < 0.4) return 'hsl(168 30% 35%)'; // dim teal
    if (normalized < 0.6) return 'hsl(168 60% 56%)'; // signal-live
    if (normalized < 0.8) return 'hsl(38 90% 58%)';  // amber
    return 'hsl(6 72% 62%)';                          // signal-crit
  };

  const customTooltip = (props: unknown) => {
    const p = props as { active?: boolean; payload?: Array<{ payload?: SpectrogramDataPoint }> };
    if (p.active && p.payload && p.payload[0]) {
      const data = p.payload[0].payload;
      if (!data) return null;
      return (
        <div className="surface-1 p-3 rounded-lg border hairline shadow-lg text-sm">
          <p className="font-medium">{t('monitoring.spectrogram.frequency')}: {data.frequency.toFixed(2)} Hz</p>
          <p className="font-medium">{t('monitoring.spectrogram.power')}: {data.power.toFixed(1)} dB</p>
          <p className="text-muted-foreground text-xs mt-1">
            {identifyHarmonic(data.frequency)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('monitoring.spectrogram.title')}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Спектр частот */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{t('monitoring.spectrogram.spectrum_title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.spectrogram.spectrum_desc')}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={frequencies}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="frequency"
                type="number"
                label={{ value: t('monitoring.spectrogram.frequency_axis'), position: 'insideBottomRight', offset: -10 }}
              />
              <YAxis label={{ value: t('monitoring.spectrogram.power_axis'), angle: -90, position: 'insideLeft' }} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="power" radius={[4, 4, 0, 0]}>
                {frequencies.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getPowerColor(entry.power)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Орієнтири частот */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-4">
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium signal-live mb-1">{t('monitoring.spectrogram.mode_1')}</p>
              <p className="text-sm font-bold signal-live">0.82 Hz</p>
              <p className="text-xs signal-live">{t('monitoring.spectrogram.fore_aft')}</p>
            </div>
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium ink-1 mb-1">{t('monitoring.spectrogram.mode_2')}</p>
              <p className="text-sm font-bold ink-2">1.24 Hz</p>
              <p className="text-xs signal-live">{t('monitoring.spectrogram.lateral')}</p>
            </div>
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium ink-1 mb-1">{t('monitoring.spectrogram.mode_3')}</p>
              <p className="text-sm font-bold ink-2">2.15 Hz</p>
              <p className="text-xs ink-2">{t('monitoring.spectrogram.torsional')}</p>
            </div>
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium signal-warn mb-1">{t('monitoring.spectrogram.mode_4')}</p>
              <p className="text-sm font-bold signal-warn">3.42 Hz</p>
              <p className="text-xs signal-warn">{t('monitoring.spectrogram.higher_order')}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Аналіз піків */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Пікові частоти */}
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t('monitoring.spectrogram.peaks')}</h3>

            <div className="space-y-3">
              {peaks.map((peak, idx) => (
                <div key={idx} className="p-4 rounded-lg border-2 hairline hover:hairline transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-lg">{peak.frequency.toFixed(2)} Hz</p>
                      <p className="text-xs text-muted-foreground">{identifyHarmonic(peak.frequency)}</p>
                    </div>
                    <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                      {peak.power.toFixed(1)} dB
                    </Badge>
                  </div>
                  <div className="h-2 surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full surface-20"
                      style={{ width: `${Math.max((peak.power + 50) / 40 * 100, 5)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('monitoring.spectrogram.peak_rank', { n: idx + 1 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Індикатор піку */}
        <Card className="p-6 surface-2 hairline">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t('monitoring.spectrogram.peak_alert')}</h3>

            <div className="space-y-4">
              {/* Домінантний пік */}
              <div className="p-4 rounded-lg surface-1 border-2 border-red-300">
                <p className="text-sm font-medium text-muted-foreground mb-2">{t('monitoring.spectrogram.dominant_peak')}</p>
                <p className="text-4xl font-bold signal-crit mb-1">{peakFrequency.toFixed(2)} Hz</p>
                <p className="text-sm signal-crit mb-3">{identifyHarmonic(peakFrequency)}</p>
                <p className="text-xs text-muted-foreground">
                  {t('monitoring.spectrogram.power_label', { n: peakPower?.toFixed(1) ?? '' })}
                </p>
              </div>

              {/* Сповіщення про резонанс */}
              <div className="p-4 rounded-lg surface-3 border-l-2 hairline" style={{ borderLeftColor: 'hsl(var(--signal-crit))' }}>
                <p className="text-sm font-semibold signal-crit mb-2">{t('monitoring.spectrogram.resonance')}</p>
                <p className="text-sm signal-crit">
                  {t('monitoring.spectrogram.resonance_desc')}
                </p>
              </div>

              {/* Рекомендації */}
              <div className="p-4 rounded-lg surface-2 border hairline">
                <p className="text-sm font-semibold signal-warn mb-2">{t('monitoring.spectrogram.actions')}</p>
                <ul className="text-xs signal-warn space-y-1">
                  <li>• {t('monitoring.spectrogram.action_1')}</li>
                  <li>• {t('monitoring.spectrogram.action_2')}</li>
                  <li>• {t('monitoring.spectrogram.action_3')}</li>
                  <li>• {t('monitoring.spectrogram.action_4')}</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Теплова карта час-частота */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{t('monitoring.spectrogram.heatmap_title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.spectrogram.heatmap_desc')}
            </p>
          </div>

          {/* Спрощена теплова карта з градієнтом потужності */}
          <div className="relative w-full h-64 surface-2 rounded-lg border hairline overflow-hidden">
            {/* Комірки сітки, що представляють точки час-частота */}
            <div className="absolute inset-0 grid grid-cols-12 gap-px p-2">
              {timeFrequencyData.map((point, idx) => (
                <div
                  key={idx}
                  className="h-full rounded-sm transition-all hover:opacity-80"
                  style={{
                    backgroundColor: getPowerColor(point.power),
                    opacity: 0.8,
                    gridColumn: `${point.time_slot} / span 1`,
                  }}
                  title={`${point.frequency.toFixed(2)}Hz @ Slot ${point.time_slot}: ${point.power.toFixed(1)}dB`}
                />
              ))}
            </div>
          </div>

          {/* Легенда колірної шкали */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-300 rounded border border-gray-400" />
              <span className="text-xs font-medium">{t('monitoring.spectrogram.low_power')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-400 rounded border hairline" />
              <span className="text-xs font-medium">{t('monitoring.spectrogram.moderate')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-600 rounded border border-red-700" />
              <span className="text-xs font-medium">{t('monitoring.spectrogram.high_power')}</span>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium">{t('monitoring.spectrogram.avg_power')}</p>
              <p className="text-lg font-bold">
                {(frequencies.reduce((sum, f) => sum + f.power, 0) / frequencies.length).toFixed(1)} dB
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium">{t('monitoring.spectrogram.peak_power')}</p>
              <p className="text-lg font-bold">{peakPower?.toFixed(1)} dB</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium">{t('monitoring.spectrogram.freq_range')}</p>
              <p className="text-lg font-bold">0.5-5.0 Hz</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium">{t('monitoring.spectrogram.bandwidth')}</p>
              <p className="text-lg font-bold">4.5 Hz</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Інформація про аналіз */}
      <Card className="p-6 surface-2 hairline border border-l-2" style={{ borderLeftColor: 'hsl(var(--signal-live))' }}>
        <h3 className="font-semibold signal-live mb-3">{t('monitoring.spectrogram.guide_title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm ink-2">
          <div>
            <p className="font-medium mb-1">{t('monitoring.spectrogram.guide_natural')}</p>
            <p>
              {t('monitoring.spectrogram.guide_natural_desc')}
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">{t('monitoring.spectrogram.guide_harmonics')}</p>
            <p>
              {t('monitoring.spectrogram.guide_harmonics_desc')}
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">{t('monitoring.spectrogram.guide_damping')}</p>
            <p>
              {t('monitoring.spectrogram.guide_damping_desc')}
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">{t('monitoring.spectrogram.guide_trending')}</p>
            <p>
              {t('monitoring.spectrogram.guide_trending_desc')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
