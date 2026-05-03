'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface DamageAccumulationProps {
  data?: Array<{ month: string; cumulative_damage: number }>;
  isLoading?: boolean;
}

export function DamageAccumulation({ data = [], isLoading }: DamageAccumulationProps) {
  const t = useT();
  const stats = useMemo(() => {
    if (!data.length) return { min: 0, max: 0, latest: 0, trend: 0 };
    const latest = data[data.length - 1].cumulative_damage;
    const first  = data[0].cumulative_damage;
    return {
      min: Math.min(...data.map((d) => d.cumulative_damage)),
      max: Math.max(...data.map((d) => d.cumulative_damage)),
      latest,
      trend: latest - first,
    };
  }, [data]);

  const trendColor = stats.trend > 25 ? 'signal-crit' : stats.trend > 15 ? 'signal-warn' : 'signal-live';
  const interpretation = stats.trend > 25
    ? t('fatigue.accumulation.warning')
    : stats.trend > 15
      ? t('fatigue.accumulation.moderate')
      : t('fatigue.accumulation.stable');

  return (
    <Section
      eyebrow={t('fatigue.accumulation.eyebrow')}
      title={t('fatigue.accumulation.title')}
      description={t('fatigue.accumulation.desc')}
      trailing={
        <div className="flex items-baseline gap-2">
          <span className="display text-3xl ink-1 tabular">{stats.latest.toFixed(1)}</span>
          <span className="text-xs ink-3">%</span>
          <span className={cn('mono text-[11px] tabular ml-2', trendColor)}>
            {stats.trend >= 0 ? '↗' : '↘'} {Math.abs(stats.trend).toFixed(1)}%
          </span>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="dmgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="hsl(38 90% 58%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(38 90% 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray={chartTheme.gridDashed} stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} />
              <YAxis stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 60]} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'Cumulative Damage']}
              />
              <ReferenceLine y={50} stroke="hsl(6 72% 62%)" strokeDasharray="3 3" label={{ value: 'Critical · 50', position: 'right', fill: 'hsl(6 72% 62%)', fontSize: 10 }} />
              <ReferenceLine y={30} stroke="hsl(38 90% 58%)" strokeDasharray="3 3" label={{ value: 'Warning · 30', position: 'right', fill: 'hsl(38 90% 58%)', fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="cumulative_damage"
                stroke="hsl(38 90% 58%)"
                strokeWidth={2}
                fill="url(#dmgGrad)"
                dot={{ fill: 'hsl(38 90% 58%)', r: 3, stroke: 'hsl(30 10% 5%)', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-4 gap-2 mt-5">
            <StatCell label={t('common.starting')} value={stats.min.toFixed(1)} unit="%" />
            <StatCell label={t('common.current')}  value={stats.latest.toFixed(1)} unit="%" />
            <StatCell label={t('common.peak')}     value={stats.max.toFixed(1)} unit="%" />
            <StatCell label={t('fatigue.accumulation.delta')}    value={`+${stats.trend.toFixed(1)}`} unit="%" />
          </div>

          <p className={cn('mt-4 text-xs ink-3 leading-relaxed text-pretty')}>
            <span className="eyebrow mr-2">{t('fatigue.accumulation.analysis')}</span>
            {interpretation}
          </p>
        </>
      )}
    </Section>
  );
}
