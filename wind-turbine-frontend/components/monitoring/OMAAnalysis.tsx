'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

interface OMAMode {
  mode: number;
  frequency: number; // Гц
  damping: number; // %
  modeShape: Array<{
    dof: number;
    displacement: number;
  }>;
  confidence: number; // 0-100
}

interface OMAAnalysisProps {
  modes?: OMAMode[];
  selectedMode?: number;
  isLoading?: boolean;
}

export function OMAAnalysis({
  modes = [
    {
      mode: 1,
      frequency: 0.82,
      damping: 3.2,
      modeShape: [
        { dof: 1, displacement: 0.0 },
        { dof: 2, displacement: 0.25 },
        { dof: 3, displacement: 0.5 },
        { dof: 4, displacement: 0.75 },
        { dof: 5, displacement: 1.0 },
        { dof: 6, displacement: 0.85 },
        { dof: 7, displacement: 0.6 },
      ],
      confidence: 92,
    },
    {
      mode: 2,
      frequency: 1.24,
      damping: 2.8,
      modeShape: [
        { dof: 1, displacement: 0.0 },
        { dof: 2, displacement: -0.3 },
        { dof: 3, displacement: -0.6 },
        { dof: 4, displacement: -0.8 },
        { dof: 5, displacement: -0.7 },
        { dof: 6, displacement: -0.4 },
        { dof: 7, displacement: 0.0 },
      ],
      confidence: 88,
    },
    {
      mode: 3,
      frequency: 2.15,
      damping: 4.1,
      modeShape: [
        { dof: 1, displacement: 0.2 },
        { dof: 2, displacement: 0.4 },
        { dof: 3, displacement: 0.6 },
        { dof: 4, displacement: 0.3 },
        { dof: 5, displacement: -0.3 },
        { dof: 6, displacement: -0.5 },
        { dof: 7, displacement: -0.3 },
      ],
      confidence: 85,
    },
    {
      mode: 4,
      frequency: 3.42,
      damping: 3.5,
      modeShape: [
        { dof: 1, displacement: -0.1 },
        { dof: 2, displacement: 0.2 },
        { dof: 3, displacement: -0.4 },
        { dof: 4, displacement: 0.7 },
        { dof: 5, displacement: -0.8 },
        { dof: 6, displacement: 0.4 },
        { dof: 7, displacement: -0.2 },
      ],
      confidence: 80,
    },
  ],
  selectedMode = 1,
  isLoading = false,
}: OMAAnalysisProps) {
  const t = useT();
  const frequencyData = useMemo(
    () =>
      modes.map((m) => ({
        mode: t('monitoring.oma.mode', { n: m.mode }),
        frequency: m.frequency,
        damping: m.damping,
      })),
    [modes, t]
  );

  const selectedModeData = modes.find((m) => m.mode === selectedMode);

  const dampingThreshold = 5.0;
  const dampingStatus = selectedModeData && selectedModeData.damping > dampingThreshold ? 'healthy' : 'warning';

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('monitoring.oma.fallback_title')}</h3>
          <Skeleton className="h-80 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Власні частоти */}
      <div className="lg:col-span-2">
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('monitoring.oma.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('monitoring.oma.desc')}
              </p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={frequencyData}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(28 8% 14%)" vertical={false} />
                <XAxis dataKey="mode" stroke="hsl(28 5% 30%)" tick={{ fill: 'hsl(32 6% 50%)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'hsl(28 8% 14%)' }} />
                <YAxis yAxisId="left" stroke="hsl(28 5% 30%)" tick={{ fill: 'hsl(32 6% 50%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(28 5% 30%)" tick={{ fill: 'hsl(32 6% 50%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'hsl(28 8% 14% / 0.5)' }}
                  contentStyle={{
                    background: 'hsl(26 8% 11%)',
                    border: '1px solid hsl(28 8% 22%)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'hsl(40 12% 92%)',
                  }}
                  labelStyle={{ color: 'hsl(36 8% 68%)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(36 8% 68%)' }} />
                <Bar yAxisId="left" dataKey="frequency" fill="hsl(38 90% 58%)" name={t('monitoring.oma.frequency_axis')} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="damping"
                  stroke="hsl(168 60% 56%)"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(168 60% 56%)', r: 3, stroke: 'hsl(30 10% 5%)', strokeWidth: 2 }}
                  name={t('monitoring.oma.damping_axis')}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Таблиця статистики */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {modes.map((mode) => (
                <div
                  key={mode.mode}
                  className={`p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                    selectedMode === mode.mode
                      ? 'border-blue-500 surface-2'
                      : 'hairline hover:hairline'
                  }`}
                >
                  <p className="text-xs text-muted-foreground font-medium">{t('monitoring.oma.mode', { n: mode.mode })}</p>
                  <p className="text-sm font-bold mt-1">{mode.frequency.toFixed(2)} Hz</p>
                  <p className="text-xs text-muted-foreground">{t('monitoring.oma.mode_damping_suffix', { n: mode.damping.toFixed(1) })}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Статус коефіцієнта демпфування */}
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('monitoring.damping.title')}</h3>

          {selectedModeData && (
            <div className="space-y-4">
              {/* Інформація про поточну моду */}
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground font-medium mb-2">{t('monitoring.damping.selected')}</p>
                <p className="text-2xl font-bold">{selectedModeData.mode}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('monitoring.damping.frequency')}: {selectedModeData.frequency.toFixed(2)} Hz
                </p>
              </div>

              {/* Шкала демпфування */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{t('monitoring.damping.ratio')}</span>
                  <Badge variant={dampingStatus === 'healthy' ? 'default' : 'secondary'}>
                    {dampingStatus === 'healthy' ? t('status.healthy') : t('status.warning')}
                  </Badge>
                </div>
                <div className="relative h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      dampingStatus === 'healthy'
                        ? 'surface-20'
                        : dampingStatus === 'warning'
                          ? 'surface-20'
                          : 'surface-20'
                    }`}
                    style={{ width: `${Math.min((selectedModeData.damping / 10) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span className="font-medium">{selectedModeData.damping.toFixed(1)}%</span>
                  <span>10%+</span>
                </div>
              </div>

              {/* Достовірність моделі */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{t('monitoring.damping.confidence')}</span>
                  <span className="text-sm font-bold">{selectedModeData.confidence}%</span>
                </div>
                <div className="relative h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full surface-20 transition-all"
                    style={{ width: `${selectedModeData.confidence}%` }}
                  />
                </div>
              </div>

              {/* Рекомендації */}
              <div className="p-3 rounded-lg surface-2 border hairline">
                <p className="text-xs font-medium signal-warn mb-1">{t('monitoring.damping.recommendations')}</p>
                <ul className="text-xs signal-warn space-y-1">
                  <li>
                    - {dampingStatus === 'healthy' ? t('monitoring.oma.damping_optimal') : t('monitoring.oma.damping_below')}
                  </li>
                  <li>
                    - {t('monitoring.oma.recommend_freq')}
                  </li>
                  <li>- {t('monitoring.oma.recommend_review')}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Візуалізація форми моди */}
      <Card className="lg:col-span-3 p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">
              {t('monitoring.oma.shape_title', { n: selectedModeData?.mode ?? '' })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.oma.shape_desc')}
            </p>
          </div>

          {selectedModeData && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={selectedModeData.modeShape}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(28 8% 14%)" vertical={false} />
                <XAxis dataKey="dof" stroke="hsl(28 5% 30%)" tick={{ fill: 'hsl(32 6% 50%)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'hsl(28 8% 14%)' }} />
                <YAxis stroke="hsl(28 5% 30%)" tick={{ fill: 'hsl(32 6% 50%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'hsl(28 8% 14% / 0.5)' }}
                  contentStyle={{
                    background: 'hsl(26 8% 11%)',
                    border: '1px solid hsl(28 8% 22%)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'hsl(40 12% 92%)',
                  }}
                />
                <Bar dataKey="displacement" fill="hsl(38 90% 58%)" name={t('monitoring.oma.displacement')} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Інтерпретація форми моди */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium ink-1 mb-1">{t('monitoring.oma.fore_aft_mode')}</p>
              <p className="text-xs ink-2">
                {t('monitoring.oma.fore_aft_desc', { n: selectedModeData?.frequency.toFixed(2) ?? '' })}
              </p>
            </div>
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium ink-1 mb-1">{t('monitoring.oma.damping_label')}</p>
              <p className="text-xs text-purple-800">
                {t('monitoring.oma.damping_struct', { n: selectedModeData?.damping.toFixed(1) ?? '' })}
              </p>
            </div>
            <div className="p-3 rounded-lg surface-2 border hairline">
              <p className="text-xs font-medium signal-live mb-1">{t('monitoring.oma.mac_value')}</p>
              <p className="text-xs signal-live">
                {(selectedModeData?.confidence ?? 0) > 85 ? t('monitoring.oma.mac_excellent') : t('monitoring.oma.mac_good')}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
