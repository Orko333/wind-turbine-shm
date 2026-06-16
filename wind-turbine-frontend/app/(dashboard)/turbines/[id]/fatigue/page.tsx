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
import { DamageForecast } from '@/components/fatigue/DamageForecast';
import { useT, useLocale } from '@/lib/i18n';

interface ScadaSample {
  timestamp: string;
  tower_moment_knm: number;
  vibration_mms: number;
  cumulative_damage: number;
}
interface ScadaHistoryResponse {
  samples: ScadaSample[];
}

// Крива Велера (S-N) — фізична залежність, не телеметрія. Біномна модель
// класу FAT 71 для зварного з'єднання башти S355 (записка, ф-ли 2.1–2.2):
// log N = log C − m·log Δσ, коліно при N = 10^7.
function snCurve() {
  const logC1 = 12.592, m1 = 3, logC2 = 16.301, m2 = 5, nKnee = 1e7;
  return Array.from({ length: 24 }, (_, i) => {
    const logN = 4 + (i * 5) / 23; // N від 10^4 до 10^9
    const N = Math.pow(10, logN);
    const stress = N <= nKnee
      ? Math.pow(10, (logC1 - logN) / m1)
      : Math.pow(10, (logC2 - logN) / m2);
    return { cycles: N, stress };
  });
}

export default function FatiguePage() {
  const t = useT();
  const { locale } = useLocale();
  const params = useParams();
  const turbineId = params.id as string;

  const { turbine, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  // Real SCADA history for rainflow-equivalent: bucket tower moment ranges
  const { data: scadaHistory } = useQuery({
    queryKey: ['scada-history', turbineId, 24, 'fatigue'],
    queryFn: () => getApiWithAuth<ScadaHistoryResponse>(`/scada/history/${turbineId}?hours=24`),
    enabled: Boolean(turbineId),
    staleTime: 60_000,
  });

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

  // RUL countdown in YEARS: залишковий ресурс спадає на 1 рік за рік
  // експлуатації й сягає 0 через `rul` років. Довірча смуга ±1.5 року.
  const rulForecast = useMemo(() => {
    const rul = turbine?.rul_years || 0;
    const horizon = Math.max(2, Math.ceil(rul));
    return Array.from({ length: horizon + 1 }, (_, year) => ({
      year,
      rul: Math.max(0, rul - year),
      confidence_upper: Math.max(0, rul + 1.5 - year),
      confidence_lower: Math.max(0, rul - 1.5 - year),
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
      {/* Накопичене пошкодження за роки — фізична проекція Пальмгрена–Майнера */}
      <Card className="p-6">
        <DamageForecast
          turbineId={turbineId}
          currentDamage={(turbine.damage_rate ?? 0) / 100}
          rulYears={turbine.rul_years ?? 0}
          designLifeYears={20}
          ratedPowerMw={turbine.rated_power_kw ? turbine.rated_power_kw / 1000 : undefined}
        />
      </Card>

      {/* RUL Forecast with Confidence Band */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.rul_forecast_band')}</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={rulForecast}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" label={{ value: locale === 'uk' ? 'Роки вперед' : 'Years ahead', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: locale === 'uk' ? 'RUL, років' : 'RUL, years', angle: -90, position: 'insideLeft' }} />
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
