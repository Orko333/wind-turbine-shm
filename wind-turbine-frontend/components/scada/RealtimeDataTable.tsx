'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { TurbineRealtimeData } from '@/types/api';

interface RealtimeDataTableProps {
  data: TurbineRealtimeData | null;
  previousData?: TurbineRealtimeData | null;
  isLoading?: boolean;
}

interface DataPoint {
  id: string;
  label: string;
  value: number;
  unit: string;
  previousValue?: number;
  thresholds: {
    green: [number, number];
    yellow: [number, number];
  };
}

function getValueColor(
  value: number,
  thresholds: { green: [number, number]; yellow: [number, number] }
): 'green' | 'yellow' | 'red' {
  const [greenMin, greenMax] = thresholds.green;
  const [yellowMin, yellowMax] = thresholds.yellow;

  if (value >= greenMin && value <= greenMax) {
    return 'green';
  }
  if (value >= yellowMin && value <= yellowMax) {
    return 'yellow';
  }
  return 'red';
}

function getTrend(current: number, previous?: number): 'up' | 'down' | 'stable' {
  if (!previous) return 'stable';
  const diff = current - previous;
  const tolerance = Math.abs(previous) * 0.01; // допуск 1%
  if (Math.abs(diff) < tolerance) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

function DataPointCell({
  point,
  color,
  trend,
}: {
  point: DataPoint;
  color: 'green' | 'yellow' | 'red';
  trend: 'up' | 'down' | 'stable';
}) {
  const colorClasses = {
    green: 'surface-2 hairline border signal-live',
    yellow: 'surface-2 hairline border signal-warn',
    red: 'surface-2 hairline border signal-crit',
  };

  const trendColorClasses = {
    up: 'signal-live',
    down: 'signal-crit',
    stable: 'text-gray-400',
  };

  const trendIcons = {
    up: <ArrowUp className="w-4 h-4" />,
    down: <ArrowDown className="w-4 h-4" />,
    stable: <div className="w-4 h-4 flex items-center justify-center">-</div>,
  };

  return (
    <div className={cn('p-4 rounded-lg border', colorClasses[color])}>
      <div className="space-y-2">
        <div className="text-xs font-medium opacity-75">{point.label}</div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {point.value != null ? point.value.toFixed(point.id === 'power_kw' ? 0 : 1) : '—'}
            </span>
            <span className="text-xs opacity-75">{point.unit}</span>
          </div>
          <div className={cn('flex items-center', trendColorClasses[trend])}>
            {trendIcons[trend]}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RealtimeDataTable({
  data,
  previousData,
  isLoading,
}: RealtimeDataTableProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [animatingKeys, setAnimatingKeys] = useState<Set<string>>(new Set());

  // Відстежувати, які значення змінилися для плавної анімації
  useEffect(() => {
    if (!data || !previousData) return;

    const changed = new Set<string>();
    if (data.wind_speed !== previousData.wind_speed)
      changed.add('wind_speed');
    if (data.power_kw !== previousData.power_kw) changed.add('power_kw');
    if (data.rotor_rpm !== previousData.rotor_rpm) changed.add('rotor_rpm');
    if (data.pitch_angle !== previousData.pitch_angle)
      changed.add('pitch_angle');
    if (data.tower_moment_knm !== previousData.tower_moment_knm)
      changed.add('tower_moment_knm');
    if (data.blade_load_kn !== previousData.blade_load_kn)
      changed.add('blade_load_kn');
    if (data.vibration_mms !== previousData.vibration_mms)
      changed.add('vibration_mms');
    if (data.temperature_c !== previousData.temperature_c)
      changed.add('temperature_c');

    setAnimatingKeys(changed);
    const timer = setTimeout(() => setAnimatingKeys(new Set()), 500);
    return () => clearTimeout(timer);
  }, [data, previousData]);

  const dataPoints = useMemo<DataPoint[]>(() => {
    if (!data) return [];

    return [
      {
        id: 'wind_speed',
        label: t('turbines.col.wind_speed'),
        value: data.wind_speed,
        unit: 'm/s',
        previousValue: previousData?.wind_speed,
        thresholds: {
          green: [4, 15],
          yellow: [2, 20],
        },
      },
      {
        id: 'power_kw',
        label: t('scada.col.power'),
        value: data.power_kw,
        unit: t('common.kw'),
        previousValue: previousData?.power_kw,
        thresholds: {
          green: [1500, 3000],
          yellow: [500, 3500],
        },
      },
      {
        id: 'rotor_rpm',
        label: t('turbines.col.rotor_rpm'),
        value: data.rotor_rpm,
        unit: 'rpm',
        previousValue: previousData?.rotor_rpm,
        thresholds: {
          green: [8, 12],
          yellow: [5, 14],
        },
      },
      {
        id: 'pitch_angle',
        label: t('scada.realtime.pitch_angle'),
        value: data.pitch_angle,
        unit: '°',
        previousValue: previousData?.pitch_angle,
        thresholds: {
          green: [0, 25],
          yellow: [-5, 35],
        },
      },
      {
        id: 'tower_moment_knm',
        label: t('scada.realtime.tower_moment'),
        value: data.tower_moment_knm,
        unit: 'kN·m',
        previousValue: previousData?.tower_moment_knm,
        thresholds: {
          green: [0, 15000],
          yellow: [0, 18000],
        },
      },
      {
        id: 'blade_load_kn',
        label: t('scada.realtime.blade_load'),
        value: data.blade_load_kn,
        unit: 'kN',
        previousValue: previousData?.blade_load_kn,
        thresholds: {
          green: [20, 80],
          yellow: [10, 95],
        },
      },
      {
        id: 'vibration_mms',
        label: t('scada.realtime.vibration'),
        value: data.vibration_mms,
        unit: 'mm/s',
        previousValue: previousData?.vibration_mms,
        thresholds: {
          green: [0, 7],
          yellow: [0, 10],
        },
      },
      {
        id: 'temperature_c',
        label: t('scada.realtime.temperature'),
        value: data.temperature_c,
        unit: '°C',
        previousValue: previousData?.temperature_c,
        thresholds: {
          green: [15, 45],
          yellow: [10, 50],
        },
      },
    ];
  }, [data, previousData, t]);

  if (isLoading && !data) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('scada.realtime_data')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('scada.realtime_data')}</h3>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            {t('scada.no_data')}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('scada.realtime_data')}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t('scada.realtime.update_freq')}
          </p>
        </div>

        <div
          ref={containerRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {dataPoints.map((point) => {
            const color = getValueColor(point.value, point.thresholds);
            const trend = getTrend(point.value, point.previousValue);
            const isAnimating = animatingKeys.has(point.id);

            return (
              <div
                key={point.id}
                className={cn(
                  'transition-transform duration-300',
                  isAnimating && 'scale-105'
                )}
              >
                <DataPointCell
                  point={point}
                  color={color}
                  trend={trend}
                />
              </div>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground mt-4 text-right">
          {t('scada.realtime.last_updated')}: {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A'}
        </div>
      </div>
    </Card>
  );
}
