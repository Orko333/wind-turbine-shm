'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
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
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

// Mock cumulative damage дані
function generateDamageData(baseRate: number) {
  const days = Array.from({ length: 365 }, (_, i) => i);
  let cumulative = 0;
  return days.map((day) => {
    cumulative += (baseRate / 365) * (0.8 + Math.random() * 0.4);
    return {
      day: day,
      cumulative: Math.min(100, cumulative),
      daily: (baseRate / 365) * (0.8 + Math.random() * 0.4),
    };
  });
}

// Mock rainflow histogram
function generateRainflowHistogram() {
  const bins = Array.from({ length: 10 }, (_, i) => i + 1);
  return bins.map((bin) => ({
    bin: `${bin * 10}-${(bin + 1) * 10}%`,
    count: Math.floor(Math.random() * 500) + 100,
  }));
}

// Mock S-N curve дані (logarithmic scale)
function generateSNCurveData() {
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

  const damageData = useMemo(
    () => generateDamageData(turbine?.damage_rate || 5),
    [turbine?.damage_rate]
  );

  const rainflowData = useMemo(() => generateRainflowHistogram(), []);
  const snCurveData = useMemo(() => generateSNCurveData(), []);

  // RUL confidence band
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
