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

interface ThrustMomentProps {
  data?: Array<{
    wind_speed: number;
    thrust_kn: number;
    moment_knm: number;
  }>;
  model?: string;
  rotorDiameterM?: number;
  airDensity?: number;
  isLoading?: boolean;
}

export function ThrustMoment({ data = [], model = '2.5MW', rotorDiameterM, airDensity, isLoading }: ThrustMomentProps) {
  const t = useT();
  const rotorDiameter = rotorDiameterM ?? (model === '3.0MW' ? 112 : 96); // метри
  const rotorArea = (Math.PI * (rotorDiameter / 2) ** 2) / 1000; // км^2

  // Генерація синтетичної обвідної навантажень, якщо дані не надано
  const chartData = useMemo(() => {
    if (data && data.length > 0) {
      return [...data].sort((a, b) => a.wind_speed - b.wind_speed);
    }

    // Тяга: T = 0.5 * rho * A * Cp * v^2
    // Момент: M = T * R (приблизно)
    const rho = airDensity ?? 1.225; // густина повітря (з глобальних налаштувань)
    const result = [];

    for (let v = 3; v <= 25; v += 0.5) {
      let thrust, moment;

      if (v < 3.5) {
        thrust = 0;
        moment = 0;
      } else if (v < 12.5) {
        // Лінійна область
        const cp = 0.48 * ((v - 3.5) / 9);
        thrust = 0.5 * rho * rotorArea * cp * v * v * 1000; // кН
        moment = thrust * (rotorDiameter / 2 / 1000); // кНм
      } else if (v < 25) {
        // Область керування кроком — тяга обмежена
        thrust = 900 + (v - 12.5) * 50; // кН (обмежений ріст)
        moment = thrust * (rotorDiameter / 2 / 1000);
      } else {
        // Вимкнення
        thrust = 0;
        moment = 0;
      }

      result.push({
        wind_speed: v,
        thrust_kn: Math.max(0, thrust),
        moment_knm: Math.max(0, moment),
      });
    }

    return result;
  }, [data, rotorDiameter, rotorArea]);

  const maxThrust = useMemo(() => {
    return Math.max(...chartData.map((d) => d.thrust_kn));
  }, [chartData]);

  const maxMoment = useMemo(() => {
    return Math.max(...chartData.map((d) => d.moment_knm));
  }, [chartData]);

  const customTooltip = (props: unknown) => {
    const p = props as { active?: boolean; payload?: Array<{ payload?: { wind_speed: number; thrust_kn: number; moment_knm: number } }> };
    if (p.active && p.payload && p.payload.length >= 1) {
      const data = p.payload[0].payload;
      if (!data) return null;
      return (
        <div className="surface-1 p-3 rounded-lg border hairline shadow-lg">
          <p className="text-sm font-medium ink-1">
            {t('turbines.wind_speed')}: {data.wind_speed.toFixed(1)} m/s
          </p>
          <p className="text-sm signal-live">
            {t('physics.rotor_thrust')}: {data.thrust_kn.toFixed(0)} kN
          </p>
          <p className="text-sm ink-2">
            {t('physics.bending_moment')}: {data.moment_knm.toFixed(0)} kNm
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
          <h3 className="text-lg font-semibold">{t('physics.load_envelope')}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('physics.load_envelope_title', { model })}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('physics.load_envelope_sub')}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 60, bottom: 20, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="wind_speed"
              label={{ value: t('physics.wind_speed_ms'), position: 'insideBottomRight', offset: -10 }}
            />
            <YAxis
              yAxisId="left"
              label={{ value: t('physics.thrust'), angle: -90, position: 'insideLeft' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ value: t('physics.moment'), angle: 90, position: 'insideRight' }}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            <ReferenceLine
              x={12.5}
              stroke="#f97316"
              strokeDasharray="5 5"
              label={{
                value: t('physics.rated_wind'),
                position: 'top',
                fill: '#f97316',
                fontSize: 12,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="thrust_kn"
              stroke="hsl(38 90% 58%)"
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
              name={t('physics.rotor_thrust')}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="moment_knm"
              stroke="hsl(168 60% 56%)"
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
              name={t('physics.bending_moment')}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Статистика навантажень */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          <div className="p-3 rounded-lg surface-2 border hairline">
            <p className="text-xs ink-2">{t('physics.max_thrust')}</p>
            <p className="text-lg font-semibold ink-1">{maxThrust.toFixed(0)} kN</p>
          </div>
          <div className="p-3 rounded-lg surface-2 border hairline">
            <p className="text-xs signal-live">{t('physics.max_moment')}</p>
            <p className="text-lg font-semibold ink-1">{maxMoment.toFixed(0)} kNm</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.rotor_diameter')}</p>
            <p className="text-lg font-semibold">{rotorDiameter} m</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">{t('physics.rotor_area')}</p>
            <p className="text-lg font-semibold">{rotorArea.toFixed(1)} km²</p>
          </div>
        </div>

        {/* Інформація про втому башти */}
        <div className="p-4 rounded-lg surface-2 border hairline mt-4">
          <p className="text-sm signal-warn">
            {t('physics.tower_fatigue_info')}
          </p>
        </div>
      </div>
    </Card>
  );
}
