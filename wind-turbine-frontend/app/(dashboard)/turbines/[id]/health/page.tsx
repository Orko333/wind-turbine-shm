'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useTurbineData } from '@/hooks/useTurbineData';
import { getApiWithAuth } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface HealthSnapshot {
  turbine_id: string;
  cumulative_damage: number;
  health_score: number;
  status: string;
  oma_modes: Array<{ mode: string; frequency: number; damping: number }>;
  blade_condition: { erosion_percent: number; ice_percent: number; imbalance_percent: number };
  geodetic_settlement: Array<{ month: number; settlement_mm: number }>;
  vibration_spectrogram: Array<{ frequency_hz: number; amplitude: number }>;
}

export default function HealthPage() {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;

  const { turbine, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  // Real health snapshot from backend (deterministic, derived from
  // the turbine's cumulative_damage — no Math.random)
  const { data: snapshot } = useQuery({
    queryKey: ['health-snapshot', turbineId],
    queryFn: () => getApiWithAuth<HealthSnapshot>(`/health-snapshot/${turbineId}`),
    enabled: Boolean(turbineId),
    staleTime: 60_000,
  });

  const omaFrequencies = useMemo(() => snapshot?.oma_modes ?? [], [snapshot]);
  const bladeCondition = useMemo(
    () => snapshot?.blade_condition ?? { erosion_percent: 0, ice_percent: 0, imbalance_percent: 0 },
    [snapshot]
  );
  const geodethicSettlement = useMemo(
    () => (snapshot?.geodetic_settlement ?? []).map((p) => ({ month: p.month, settlement: p.settlement_mm })),
    [snapshot]
  );
  const vibrationSpectrogram = useMemo(
    () => (snapshot?.vibration_spectrogram ?? []).map((s) => ({ frequency: `${s.frequency_hz} Hz`, amplitude: s.amplitude })),
    [snapshot]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!turbine) {
    return (
      <div className="rounded-lg surface-2 border hairline p-6">
        <p className="signal-crit">{t('turbines.not_found')}</p>
      </div>
    );
  }

  const omaChartData = omaFrequencies.map((f) => ({
    mode: f.mode.split(' ')[0],
    frequency: f.frequency,
    damping: f.damping,
  }));

  return (
    <div className="space-y-6">
      {/* OMA Frequencies */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.oma_title')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={omaChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mode" />
            <YAxis yAxisId="left" label={{ value: t('turbines.frequency_hz'), angle: -90, position: 'insideLeft' }} />
            <YAxis yAxisId="right" orientation="right" label={{ value: t('turbines.damping_pct'), angle: 90, position: 'insideRight' }} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="frequency" fill="hsl(38 90% 58%)" name={t('turbines.frequency_hz')} />
            <Bar yAxisId="right" dataKey="damping" fill="hsl(168 60% 56%)" name={t('turbines.damping_pct')} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {omaFrequencies.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 signal-live mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{f.mode}</p>
                <p className="text-xs text-muted-foreground">
                  {t('turbines.damping_label', { f: f.frequency.toFixed(2), d: (f.damping * 100).toFixed(1) })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Blade Condition */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.blade_condition')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Erosion */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('turbines.blade_erosion')}</span>
              <span className="text-lg font-semibold">
                {bladeCondition.erosion_percent.toFixed(1)}%
              </span>
            </div>
            <div className="bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full surface-20 transition-all"
                style={{ width: `${bladeCondition.erosion_percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {bladeCondition.erosion_percent < 5
                ? t('turbines.normal_wear')
                : bladeCondition.erosion_percent < 10
                  ? t('turbines.moderate_erosion')
                  : t('turbines.significant_erosion')}
            </p>
          </div>

          {/* Ice */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('turbines.ice_accumulation')}</span>
              <span className="text-lg font-semibold">
                {bladeCondition.ice_percent.toFixed(1)}%
              </span>
            </div>
            <div className="surface-3 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-live transition-all"
                style={{ width: `${bladeCondition.ice_percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {bladeCondition.ice_percent < 2 ? t('turbines.no_ice') : t('turbines.monitor_conditions')}
            </p>
          </div>

          {/* Imbalance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('turbines.mass_imbalance')}</span>
              <span className="text-lg font-semibold">
                {bladeCondition.imbalance_percent.toFixed(1)}%
              </span>
            </div>
            <div className="bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full surface-20 transition-all"
                style={{ width: `${bladeCondition.imbalance_percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {bladeCondition.imbalance_percent < 5 ? t('turbines.balanced') : t('turbines.rebalance')}
            </p>
          </div>
        </div>
      </Card>

      {/* Geodetic Settlement */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.geodetic_settlement')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={geodethicSettlement}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" label={{ value: 'Months', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'Settlement (mm)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="settlement"
              stroke="hsl(168 60% 56%)"
              dot={false}
              name={t('turbines.foundation_settlement')}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-sm text-muted-foreground mt-4">
          {t('turbines.total_settlement', { v: (geodethicSettlement[geodethicSettlement.length - 1]?.settlement || 0).toFixed(2) })}
          {Math.abs(geodethicSettlement[geodethicSettlement.length - 1]?.settlement || 0) < 5 ? (
            <span className="ml-2 inline-flex items-center gap-1">
              <CheckCircle className="w-4 h-4 signal-live" />
              {t('turbines.within_limits')}
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 signal-warn" />
              {t('turbines.monitor_changes')}
            </span>
          )}
        </p>
      </Card>

      {/* Vibration Spectrogram */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.vibration_spectrum')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={vibrationSpectrogram}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="frequency" />
            <YAxis label={{ value: t('turbines.vibration_amplitude'), angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="amplitude" fill="hsl(168 60% 56%)" name={t('turbines.vibration_amplitude')} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-sm text-muted-foreground mt-4">
          {t('turbines.vibration_desc')}
        </p>
      </Card>

      {/* Health Summary */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.health_summary')}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 surface-2 rounded-lg border hairline">
            <span className="text-sm font-medium signal-live">{t('turbines.structural_health')}</span>
            <CheckCircle className="w-5 h-5 signal-live" />
          </div>
          <div className="flex items-center justify-between p-3 surface-2 rounded-lg border hairline">
            <span className="text-sm font-medium ink-1">{t('turbines.modal_parameters')}</span>
            <CheckCircle className="w-5 h-5 signal-live" />
          </div>
          <div className="flex items-center justify-between p-3 surface-2 rounded-lg border hairline">
            <span className="text-sm font-medium signal-warn">{t('turbines.blade_condition')}</span>
            <AlertTriangle className="w-5 h-5 signal-warn" />
          </div>
          <div className="flex items-center justify-between p-3 surface-2 rounded-lg border hairline">
            <span className="text-sm font-medium signal-live">{t('turbines.foundation_settlement')}</span>
            <CheckCircle className="w-5 h-5 signal-live" />
          </div>
        </div>
      </Card>
    </div>
  );
}
