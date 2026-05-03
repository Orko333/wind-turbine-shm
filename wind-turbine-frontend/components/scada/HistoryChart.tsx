'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getApiWithAuth } from '@/lib/api';
import { useT } from '@/lib/i18n';

interface ScadaHistorySample {
  timestamp: string;
  wind_speed: number;
  rotor_rpm: number;
  pitch_angle: number;
  power_kw: number;
  tower_moment_knm: number;
  tower_top_accel_rms: number | null;
  blade_load_kn: number | null;
  vibration_mms: number | null;
  nacelle_temp_degC: number | null;
  cumulative_damage: number | null;
}

interface ScadaHistoryResponse {
  turbine_id: string;
  count: number;
  samples: ScadaHistorySample[];
}

interface HistoryChartProps {
  turbineId: string | null;
  hours?: number;
  refreshKey?: number;
}

export function HistoryChart({ turbineId, hours = 24, refreshKey = 0 }: HistoryChartProps) {
  const t = useT();
  const [data, setData] = useState<ScadaHistorySample[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!turbineId) {
      setData([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getApiWithAuth<ScadaHistoryResponse>(`/scada/history/${turbineId}?hours=${hours}&limit=2000`)
      .then((res) => {
        if (!cancelled) setData(res.samples || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [turbineId, hours, refreshKey]);

  const chartData = data.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    wind_speed: s.wind_speed,
    power_kw: s.power_kw,
    tower_moment_knm: s.tower_moment_knm,
  }));

  return (
    <section>
      <header className="flex items-end justify-between pb-4 hairline-b">
        <div>
          <p className="eyebrow">{t('scada.history.eyebrow') || 'TIME SERIES'}</p>
          <h3 className="display text-2xl ink-1 mt-1">{t('scada.history.title') || 'Historical SCADA'}</h3>
        </div>
        <p className="mono text-[10px] tracking-widest ink-3 tabular">
          {(t('scada.history.last_n_hours') || `Last ${hours} hours`).replace('{n}', String(hours))}
          <span className="mx-2 ink-4">·</span>
          {data.length} samples
        </p>
      </header>

      {isLoading ? (
        <div className="h-[300px] mt-4 surface-2 rounded-lg animate-pulse hairline border" />
      ) : error ? (
        <div className="h-[300px] mt-4 flex items-center justify-center text-sm signal-crit surface-1 hairline border rounded-lg">{error}</div>
      ) : chartData.length === 0 ? (
        <div className="h-[300px] mt-4 flex items-center justify-center text-sm ink-3 surface-1 hairline border rounded-lg">
          {t('scada.history.empty') || 'No samples yet — readings persist every 10s.'}
        </div>
      ) : (
        <div className="mt-4 surface-1 hairline border rounded-lg p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--hairline))" vertical={false} />
            <XAxis dataKey="time" stroke="hsl(var(--ink-4))" tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', fill: 'hsl(var(--ink-3))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--hairline))' }} />
            <YAxis yAxisId="left" stroke="hsl(var(--ink-4))" tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', fill: 'hsl(var(--ink-3))' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--ink-4))" tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', fill: 'hsl(var(--ink-3))' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--surface-2))',
                border: '1px solid hsl(var(--hairline-strong))',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'var(--font-geist-mono)',
                color: 'hsl(var(--ink-1))',
              }}
              labelStyle={{ color: 'hsl(var(--ink-3))', fontSize: 10, letterSpacing: '0.1em' }}
              cursor={{ stroke: 'hsl(var(--ink-4))', strokeDasharray: '2 4' }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }} iconType="circle" iconSize={6} />
            <Line yAxisId="left" type="monotone" dataKey="wind_speed" name="Wind (m/s)" stroke="hsl(168 60% 56%)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="power_kw" name="Power (kW)" stroke="hsl(38 90% 58%)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="tower_moment_knm" name="Tower M (kN·m)" stroke="hsl(6 72% 62%)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
