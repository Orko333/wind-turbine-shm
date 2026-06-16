'use client';

import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
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

interface PowerCurveProps {
  data?: Array<{
    wind_speed: number;
    power: number;
  }>;
  model?: string;
  ratedPowerKw?: number;
  isLoading?: boolean;
}

export function PowerCurve({ data = [], model = '2.5MW', ratedPowerKw, isLoading }: PowerCurveProps) {
  const t = useT();
  const ratedPower = ratedPowerKw ?? (model === '3.0MW' ? 3000 : 2500);

  // Генерація гладкої кривої через точки даних з використанням наближення кубічним сплайном
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Сортування за швидкістю вітру
    const sorted = [...data].sort((a, b) => a.wind_speed - b.wind_speed);

    // Створення щільної кривої через інтерполяцію між точками
    const result: Array<{
      wind_speed: number;
      power: number;
      isData: boolean;
    }> = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];

      // Додавання оригінальної точки
      result.push({
        wind_speed: p1.wind_speed,
        power: p1.power,
        isData: true,
      });

      // Інтерполяція між точками
      const steps = Math.ceil((p2.wind_speed - p1.wind_speed) * 2);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        const windSpeed = p1.wind_speed + (p2.wind_speed - p1.wind_speed) * t;
        // Кубічна інтерполяція для гладкішої кривої
        const power =
          p1.power +
          (p2.power - p1.power) * (3 * t * t - 2 * t * t * t);
        result.push({
          wind_speed: windSpeed,
          power,
          isData: false,
        });
      }
    }

    // Додавання останньої точки
    result.push({
      wind_speed: sorted[sorted.length - 1].wind_speed,
      power: sorted[sorted.length - 1].power,
      isData: true,
    });

    return result;
  }, [data]);

  const customTooltip = (props: unknown) => {
    const p = props as { active?: boolean; payload?: Array<{ payload?: { wind_speed: number; power: number } }> };
    if (p.active && p.payload && p.payload[0]) {
      const data = p.payload[0].payload;
      if (!data) return null;
      return (
        <div className="surface-1 p-3 rounded-lg border hairline shadow-lg">
          <p className="text-sm font-medium ink-1">
            {t('turbines.wind_speed')}: {data.wind_speed.toFixed(1)} m/s
          </p>
          <p className="text-sm font-medium ink-1">
            {t('turbines.power_output')}: {data.power.toFixed(0)} {t('common.kw')}
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
          <h3 className="text-lg font-semibold">{t('physics.power_curve_title', { model })}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('physics.power_curve_title', { model })}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('physics.power_curve_sub')}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            data={chartData}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="wind_speed"
              label={{ value: t('physics.wind_speed_ms'), position: 'insideBottomRight', offset: -10 }}
              type="number"
              domain={[0, 30]}
            />
            <YAxis
              dataKey="power"
              type="number"
              domain={[0, 'dataMax + 200']}
              label={{ value: `${t('turbines.power_output')} (${t('common.kw')})`, angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            <ReferenceLine
              y={ratedPower}
              stroke="hsl(6 72% 62%)"
              strokeDasharray="5 5"
              label={{
                value: t('physics.rated_power_label', { n: ratedPower }),
                position: 'right',
                fill: '#ef4444',
              }}
            />
            {/* Гладка крива */}
            <Scatter
              name={t('physics.power_curve')}
              data={chartData.filter((d) => !d.isData)}
              stroke="hsl(38 90% 58%)"
              fill="hsl(38 90% 58%)"
              isAnimationActive={false}
            />
            {/* Точки даних */}
            <Scatter
              name={t('physics.measured_data')}
              data={chartData.filter((d) => d.isData)}
              stroke="hsl(168 60% 56%)"
              fill="hsl(168 60% 56%)"
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.cut_in')}</p>
            <p className="text-lg font-semibold">3.5 m/s</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.rated_speed')}</p>
            <p className="text-lg font-semibold">12.5 m/s</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.cut_out')}</p>
            <p className="text-lg font-semibold">25.0 m/s</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
