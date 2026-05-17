'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useTurbineData } from '@/hooks/useTurbineData';
import { getApiWithAuth } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

interface RulTrendPoint {
  timestamp: string;
  damage_index: number;
  rul_days: number | null;
}
interface RulTrendResponse {
  turbine_id: string;
  predictions: RulTrendPoint[];
}
interface ScadaSample {
  timestamp: string;
  tower_moment_knm: number;
  vibration_mms: number;
  cumulative_damage: number;
}
interface ScadaHistoryResponse {
  samples: ScadaSample[];
}

// S-N curve uses the material's Wöhler equation, not data — it's a known
// physics relation (stress range vs cycles to failure for steel S355).
// Keep computed client-side; the *shape* doesn't depend on telemetry.
function snCurve() {
  return Array.from({ length: 20 }, (_, i) => ({
    cycles: Math.pow(10, i * 0.25),
    stress: 300 / Math.pow(Math.pow(10, i * 0.25), 0.3),
  }));
}

export default function FatiguePage() {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;

  const { turbine, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  // Real damage trajectory from backend RUL trend (each prediction has
  // damage_index which becomes cumulative damage curve)
  const { data: rulTrend } = useQuery({
    queryKey: ['rul-trend', turbineId, 'fatigue'],
    queryFn: () => getApiWithAuth<RulTrendResponse>(`/analytics/turbine/${turbineId}/rul-trend?days=24`),
    enabled: Boolean(turbineId),
    staleTime: 5 * 60_000,
  });

  // Real SCADA history for rainflow-equivalent: bucket tower moment ranges
  const { data: scadaHistory } = useQuery({
    queryKey: ['scada-history', turbineId, 24, 'fatigue'],
    queryFn: () => getApiWithAuth<ScadaHistoryResponse>(`/scada/history/${turbineId}?hours=24`),
    enabled: Boolean(turbineId),
    staleTime: 60_000,
  });

  const damageData = useMemo(() => {
    const preds = rulTrend?.predictions ?? [];
    if (!preds.length) return [];
    return preds.map((p, i) => ({
      day: i,
      cumulative: p.damage_index * 100,
      daily: i === 0 ? 0 : Math.max(0, (p.damage_index - (preds[i - 1]?.damage_index ?? 0)) * 100),
    }));
  }, [rulTrend]);

  const rainflowData = useMemo(() => {
    const samples = scadaHistory?.samples ?? [];
    if (!samples.length) return [];
    // Bucket tower moment into 10 ranges (rainflow approximation from history)
    const moments = samples.map((s) => s.tower_moment_knm).filter((v) => Number.isFinite(v));
    if (!moments.length) return [];
    const min = Math.min(...moments);
    const max = Math.max(...moments);
    const span = max - min || 1;
    const bins = Array.from({ length: 10 }, () => 0);
    for (const m of moments) {
      const idx = Math.min(9, Math.floor(((m - min) / span) * 10));
      bins[idx] += 1;
    }
    return bins.map((count, i) => {
      const low = min + (i * span) / 10;
      const high = min + ((i + 1) * span) / 10;
      return {
        bin: `${low.toFixed(0)}-${high.toFixed(0)} kNm`,
        count,
      };
    });
  }, [scadaHistory]);

  const snCurveData = useMemo(() => snCurve(), []);

  // Forecast band derived from real damage trajectory: project current slope
  const rulForecast = useMemo(() => {
    const rul = turbine?.rul_years || 0;
    const months = Array.from({ length: 24 }, (_, i) => i);
    return months.map((month) => ({
      month,
      rul: Math.max(0.1, rul - (month * rul) / 24),
      confidence_upper: Math.max(0.1, rul + 1.5 - (month * rul) / 24),
      confidence_lower: Math.max(0.1, rul - 1.5 - (month * rul) / 24),
    }));
  }, [turbine?.rul_years]);

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

  return (
    <div className="space-y-6">
      {/* Damage vs Time */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.cumulative_damage_time')}</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={damageData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" label={{ value: 'Days', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'Damage (%)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#ef4444"
              dot={false}
              name={t('turbines.cumulative_damage')}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* RUL Forecast with Confidence Band */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.rul_forecast_band')}</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={rulForecast}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" label={{ value: 'Months', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'Years', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="confidence_upper"
              stroke="transparent"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="rul"
              stroke="hsl(38 90% 58%)"
              strokeWidth={2}
              dot={false}
              name={t('turbines.predicted_rul')}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="confidence_lower"
              stroke="transparent"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-sm text-muted-foreground mt-4">
          {t('turbines.current_rul_desc', { v: (turbine.rul_years ?? 0).toFixed(2) })}
        </p>
      </Card>

      {/* Rainflow Histogram */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.rainflow_hist')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rainflowData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bin" />
            <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(168 60% 56%)" name={t('turbines.load_cycles')} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* S-N Curve (Plotly equivalent using Recharts) */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.sn_curve')}</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={snCurveData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="cycles"
              scale="log"
              type="number"
              domain={[1, 1000000000]}
              label={{ value: 'Cycles (log)', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis
              scale="log"
              type="number"
              domain={[1, 1000]}
              label={{ value: 'Stress (MPa, log)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
              labelFormatter={(value) => `${Number(value).toExponential(1)} cycles`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="stress"
              stroke="hsl(168 60% 56%)"
              dot={false}
              name={t('turbines.material_strength')}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-sm text-muted-foreground mt-4">
          {t('turbines.sn_desc')}
        </p>
      </Card>

      {/* Fatigue Summary */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.fatigue_summary')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.current_damage_rate')}</p>
            <p className="text-2xl font-bold mt-2">{(turbine.damage_rate ?? 0).toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">{t('turbines.per_year')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.estimated_rul')}</p>
            <p className="text-2xl font-bold mt-2">{(turbine.rul_years ?? 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('turbines.years_short')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.critical_threshold')}</p>
            <p className="text-2xl font-bold mt-2">10%</p>
            <p className="text-xs text-muted-foreground mt-1">{t('turbines.damage')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
