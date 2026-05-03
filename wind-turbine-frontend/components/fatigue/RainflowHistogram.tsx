'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, chartPalette, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { useT } from '@/lib/i18n';

interface RainflowHistogramProps {
  data?: Array<{ range: string; count: number }>;
  isLoading?: boolean;
}

export function RainflowHistogram({ data = [], isLoading }: RainflowHistogramProps) {
  const t = useT();
  const chartData = useMemo(
    () => data.map((d, i) => ({ ...d, fill: chartPalette[i % chartPalette.length] })),
    [data]
  );

  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);
  const highStress = useMemo(() => data.slice(-2).reduce((s, d) => s + d.count, 0), [data]);

  const damageContrib = useMemo(() => {
    return data.map((d, i) => {
      const stressLevel = 1 + i * 0.3;
      const w = Math.pow(stressLevel, 3);
      return { range: d.range, damage: (d.count * w) / total };
    });
  }, [data, total]);

  return (
    <Section
      bare
      eyebrow={t('fatigue.rainflow.eyebrow')}
      title={t('fatigue.rainflow.title')}
      description={t('fatigue.rainflow.desc')}
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray={chartTheme.gridDashed} stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="range" stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} />
              <YAxis stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} scale="log" domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ fill: 'hsl(28 8% 14% / 0.5)' }}
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <StatCell label={t('common.total')} value={total.toLocaleString()} />
            <StatCell label={t('fatigue.rainflow.high')} value={highStress.toLocaleString()} />
            <StatCell label={t('fatigue.rainflow.low')}  value={(total - highStress).toLocaleString()} />
          </div>

          <div className="mt-4 pt-4 hairline-t">
            <p className="eyebrow mb-2">{t('fatigue.rainflow.contrib')}</p>
            <div className="space-y-1.5">
              {damageContrib.slice(-3).map((d) => (
                <div key={d.range} className="flex items-center gap-3">
                  <span className="mono text-xs ink-2 w-20">{d.range}</span>
                  <div className="flex-1 h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div className="h-full bg-warn" style={{ width: `${Math.min(100, d.damage * 300)}%` }} />
                  </div>
                  <span className="mono text-xs signal-warn tabular w-12 text-right">{(d.damage * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
