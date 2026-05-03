'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, chartPalette, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { useT } from '@/lib/i18n';

interface DamageHistogramProps {
  data?: Array<{ range: string; count: number }>;
  isLoading?: boolean;
}

export function DamageHistogram({ data = [], isLoading }: DamageHistogramProps) {
  const t = useT();
  const chartData = useMemo(
    () => data.map((d, i) => ({ ...d, fill: chartPalette[i % chartPalette.length] })),
    [data]
  );

  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  const avg = useMemo(() => {
    if (!data.length) return 0;
    const w = data.reduce((sum, d) => {
      const m = d.range.match(/\d+/g);
      if (m && m.length >= 1) {
        const mid = (parseInt(m[0]) + (parseInt(m[1]) || parseInt(m[0]) + 10)) / 2;
        return sum + mid * d.count;
      }
      return sum;
    }, 0);
    return w / total;
  }, [data, total]);

  return (
    <Section
      bare
      eyebrow={t('fatigue.distribution.eyebrow')}
      title={t('fatigue.distribution.damage')}
      description={t('fatigue.distribution.damage_desc')}
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray={chartTheme.gridDashed} stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="range" stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} />
              <YAxis stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'hsl(28 8% 14% / 0.5)' }}
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v: number) => [`${v} units (${((v / total) * 100).toFixed(1)}%)`, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 gap-2 mt-5">
            <StatCell label={t('fatigue.stat.total_units')} value={total} />
            <StatCell label={t('fatigue.stat.avg_damage')} value={avg.toFixed(1)} unit="%" />
          </div>
        </>
      )}
    </Section>
  );
}
