'use client';

import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Line, ComposedChart } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { useT } from '@/lib/i18n';

interface GoodmanDiagramProps {
  data?: Array<{ mean_stress: number; alternating_stress: number; correction_method: string }>;
  isLoading?: boolean;
}

export function GoodmanDiagram({ data = [], isLoading }: GoodmanDiagramProps) {
  const t = useT();
  // Сталь S355 / E355 башти турбіни (DNV-ST-0437): σ_u = 490 МПа, σ_y = 355 МПа,
  // границя витривалості σ_a0 = 140 МПа. Значення з пояснювальної записки (§2.2.2).
  const material = { ultimate_strength: 490, yield_strength: 355, fatigue_limit: 140 };

  const goodmanLine = useMemo(() => {
    const points = [];
    for (let m = 0; m <= material.ultimate_strength; m += 20) {
      points.push({
        mean_stress: m,
        alternating_stress: Math.max(0, material.fatigue_limit * (1 - m / material.ultimate_strength)),
      });
    }
    return points;
  }, []);

  return (
    <Section
      bare
      eyebrow={t('fatigue.goodman.eyebrow')}
      title={t('fatigue.goodman.title')}
      description={t('fatigue.goodman.desc')}
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray={chartTheme.gridDashed} stroke={chartTheme.grid} />
              <XAxis type="number" dataKey="mean_stress" name="Mean Stress" stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} unit=" MPa" />
              <YAxis type="number" dataKey="alternating_stress" name="Alternating Stress" stroke={chartTheme.axis} tick={{ fill: chartTheme.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} unit=" MPa" />
              <Tooltip
                cursor={{ stroke: chartTheme.grid }}
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <ReferenceLine x={material.yield_strength} stroke="hsl(6 72% 62%)" strokeDasharray="3 3" label={{ value: 'σy', position: 'top', fill: 'hsl(6 72% 62%)', fontSize: 10 }} />
              <ReferenceLine y={material.fatigue_limit} stroke="hsl(168 60% 56%)" strokeDasharray="3 3" label={{ value: 'σa₀', position: 'right', fill: 'hsl(168 60% 56%)', fontSize: 10 }} />
              <Line
                data={goodmanLine}
                type="monotone"
                dataKey="alternating_stress"
                stroke="hsl(38 90% 58%)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Goodman Line"
              />
              <Scatter
                name="Operating Points"
                data={data}
                fill="hsl(168 60% 56%)"
                shape="circle"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <StatCell label={t('fatigue.goodman.ultimate')} value={material.ultimate_strength} unit="MPa" />
            <StatCell label={t('fatigue.goodman.yield')}    value={material.yield_strength}    unit="MPa" />
            <StatCell label={t('fatigue.goodman.fatigue')}  value={material.fatigue_limit}     unit="MPa" />
          </div>
        </>
      )}
    </Section>
  );
}
