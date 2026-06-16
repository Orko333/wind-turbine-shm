'use client';

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
  ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

interface WindShearProps {
  data?: Array<{
    height: number;
    wind_speed: number;
  }>;
  model?: string;
  hubHeightM?: number;
  isLoading?: boolean;
}

export function WindShear({ data = [], model = '2.5MW', hubHeightM, isLoading }: WindShearProps) {
  const t = useT();
  // Експонента зсуву вітру (типове значення: 0.2 для рівнинного рельєфу, 0.4 для нерівного)
  const shearExponent = 0.25;
  const referenceHeight = 10; // м
  const referenceSpeed = 10; // м/с

  // Генерація логарифмічного профілю вітру, якщо дані не надано
  const chartData = useMemo(() => {
    if (data && data.length > 0) {
      return [...data].sort((a, b) => a.height - b.height);
    }

    // Генерація синтетичних даних з використанням логарифмічного профілю: v(z) = v_ref * (z/z_ref)^alpha
    const result = [];
    for (let h = 10; h <= 150; h += 5) {
      const speed = referenceSpeed * Math.pow(h / referenceHeight, shearExponent);
      result.push({
        height: h,
        wind_speed: speed,
      });
    }
    return result;
  }, [data]);

  const hubHeight = hubHeightM ?? (model === '3.0MW' ? 100 : 90); // метри
  const speedAtHub = useMemo(() => {
    return referenceSpeed *
      Math.pow(hubHeight / referenceHeight, shearExponent);
  }, [hubHeight]);

  const customTooltip = (props: unknown) => {
    const p = props as { active?: boolean; payload?: Array<{ payload?: { height: number; wind_speed: number } }> };
    if (p.active && p.payload && p.payload[0]) {
      const data = p.payload[0].payload;
      if (!data) return null;
      return (
        <div className="surface-1 p-3 rounded-lg border hairline shadow-lg">
          <p className="text-sm font-medium ink-1">
            {t('physics.height_m')}: {data.height} m
          </p>
          <p className="text-sm font-medium ink-1">
            {t('turbines.wind_speed')}: {data.wind_speed.toFixed(2)} m/s
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('physics.wind_shear_title')}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('physics.wind_shear_with_model', { model })}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('physics.wind_shear_sub')}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="wind_speed"
              label={{ value: t('physics.wind_speed_ms'), position: 'insideBottomRight', offset: -10 }}
              type="number"
            />
            <YAxis
              label={{ value: t('physics.height_m'), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            <ReferenceLine
              y={hubHeight}
              stroke="hsl(280 35% 65%)"
              strokeDasharray="5 5"
              label={{
                value: t('physics.hub_height_value', { n: hubHeight }),
                position: 'right',
                fill: '#8b5cf6',
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="wind_speed"
              stroke="hsl(38 90% 58%)"
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
              name={t('physics.wind_speed_profile')}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Параметри зсуву вітру */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.shear_exponent')}</p>
            <p className="text-lg font-semibold">{shearExponent.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.hub_height_label')}</p>
            <p className="text-lg font-semibold">{hubHeight} m</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.speed_at_hub')}</p>
            <p className="text-lg font-semibold">{speedAtHub.toFixed(2)} m/s</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.terrain_type')}</p>
            <p className="text-lg font-semibold">{t('physics.terrain_moderate')}</p>
          </div>
        </div>

        {/* Інформація про вплив зсуву вітру */}
        <div className="p-4 rounded-lg surface-2 border hairline mt-4">
          <p className="text-sm ink-1">
            {t('physics.shear_info')}
          </p>
        </div>
      </div>
    </Card>
  );
}
