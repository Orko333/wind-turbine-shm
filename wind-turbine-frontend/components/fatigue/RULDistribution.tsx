'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, severityColor, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { useT } from '@/lib/i18n';

interface RULDistributionProps {
  data?: Array<{ range: string; turbines: number; criticality: 'low' | 'medium' | 'high' }>;
  isLoading?: boolean;
}

export function RULDistribution({ data = [], isLoading }: RULDistributionProps) {
  const t = useT();
  const chartData = useMemo(() => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    return [...data]
      .sort((a, b) => order[a.criticality] - order[b.criticality])
      .map((d) => ({ ...d, fill: severityColor[d.criticality] }));
  }, [data]);

  const total = useMemo(() => data.reduce((s, d) => s + d.turbines, 0), [data]);
  const criticalCount = data.filter((d) => d.criticality === 'high').reduce((s, d) => s + d.turbines, 0);
  const healthyCount  = data.filter((d) => d.criticality === 'low').reduce((s, d) => s + d.turbines, 0);

  return (
    <Section
      bare
      eyebrow={t('fatigue.distribution.eyebrow')}
      title={t('fatigue.distribution.rul')}
      description={t('fatigue.distribution.rul_desc')}
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
              />
              <Bar dataKey="turbines" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <StatCell label={t('fatigue.stat.critical')} value={criticalCount} />
            <StatCell label={t('common.total')} value={total} />
            <StatCell label={t('fatigue.stat.healthy')} value={healthyCount} />
          </div>
        </>
      )}
    </Section>
  );
}
