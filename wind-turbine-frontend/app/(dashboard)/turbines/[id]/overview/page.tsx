'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { useTurbineData, useTurbineAlerts } from '@/hooks/useTurbineData';
import { getApiWithAuth } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Zap, Wind, Gauge } from 'lucide-react';
import { buildRulForecast } from '@/lib/fatigue-model';
import { useT, useLocale } from '@/lib/i18n';

interface ScadaSample {
  timestamp: string;
  power_kw: number;
}
interface ScadaHistoryResponse {
  turbine_id: string;
  count: number;
  samples: ScadaSample[];
}


export default function OverviewPage() {
  const t = useT();
  const { locale } = useLocale();
  const params = useParams();
  const turbineId = params.id as string;

  const { turbine, realtimeData, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  const { data: alerts = [] } = useTurbineAlerts({
    turbineId,
    enabled: Boolean(turbineId),
  });

  const currentData = realtimeData;

  // 24h power trend from real SCADA history — bucket samples into hours
  const { data: scadaHistory } = useQuery({
    queryKey: ['scada-history', turbineId, 24],
    queryFn: () => getApiWithAuth<ScadaHistoryResponse>(`/scada/history/${turbineId}?hours=24`),
    enabled: Boolean(turbineId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const powerTrendData = useMemo(() => {
    const samples = scadaHistory?.samples ?? [];
    if (!samples.length) return [];
    // Bucket by hour-of-day (last 24 hours)
    const buckets: Record<number, { sum: number; n: number }> = {};
    for (const s of samples) {
      const h = new Date(s.timestamp).getHours();
      if (!buckets[h]) buckets[h] = { sum: 0, n: 0 };
      buckets[h].sum += s.power_kw;
      buckets[h].n += 1;
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      power: buckets[h] ? buckets[h].sum / buckets[h].n : 0,
    }));
  }, [scadaHistory]);

  // Нелінійний прогноз RUL: спадає швидше під кінець ресурсу (прискорення втоми)
  // та у вітряні роки, узгоджено з кривою накопичення пошкодження (fatigue-model).
  const rulForecastData = useMemo(
    () => buildRulForecast({
      currentDamage: turbine?.cumulative_damage ?? turbine?.damage_fraction ?? 0,
      rulYears: turbine?.rul_years ?? 0,
      designLifeYears: 20,
      turbineId,
    }),
    [turbine?.cumulative_damage, turbine?.damage_fraction, turbine?.rul_years, turbineId]
  );

  const recentAlerts = alerts.slice(0, 3);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!turbine) {
    return (
      <div className="rounded-lg surface-2 border hairline p-6">
        <p className="signal-crit">{t('turbines.not_found')}</p>
      </div>
    );
  }

  const power = currentData?.power_kw ?? turbine.power_kw ?? 0;
  const windSpeed = currentData?.wind_speed ?? turbine.wind_speed ?? 0;
  const rotorRPM = currentData?.rotor_rpm ?? turbine.rotor_rpm ?? 0;
  const ratedPower = turbine.rated_power_kw ?? 1;
  const cumulativeDamage = turbine.cumulative_damage ?? turbine.damage_fraction ?? 0;
  const rulYears = turbine.rul_years ?? 0;

  return (
    <div className="space-y-6">
      {/* Real-time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Power */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('turbines.power_output')}</p>
              <p className="text-3xl font-bold mt-2">{Math.round(power)}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('common.kw')}</p>
            </div>
            <Zap className="w-8 h-8 signal-warn" />
          </div>
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {t('turbines.rated', { n: ratedPower })}
            </p>
            <div className="mt-2 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full surface-20 transition-all"
                style={{
                  width: `${Math.min(100, (power / ratedPower) * 100)}%`,
                }}
              />
            </div>
          </div>
        </Card>

        {/* Wind Speed */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('turbines.wind_speed')}</p>
              <p className="text-3xl font-bold mt-2">{windSpeed.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground mt-1">m/s</p>
            </div>
            <Wind className="w-8 h-8 signal-live" />
          </div>
        </Card>

        {/* Rotor RPM */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('turbines.rotor_rpm')}</p>
              <p className="text-3xl font-bold mt-2">{rotorRPM.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground mt-1">RPM</p>
            </div>
            <Gauge className="w-8 h-8 ink-2" />
          </div>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Annual Energy & Damage */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">{t('turbines.annual_metrics')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('turbines.annual_energy')}
              </span>
              <span className="font-semibold">
                {(power * 8760 / 1000).toFixed(0)} MWh
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('turbines.cumulative_damage')}
              </span>
              <span className="font-semibold">
                {(cumulativeDamage * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('turbines.rul')}</span>
              <span className="font-semibold">
                {rulYears.toFixed(1)} {t('turbines.years_short')}
              </span>
            </div>
          </div>
        </Card>

        {/* Recent Alerts */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">{t('turbines.recent_alerts', { n: alerts.length })}</h3>
          {recentAlerts.length > 0 ? (
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex gap-3 pb-3 border-b last:pb-0 last:border-0">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 signal-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">
                      {alert.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('turbines.no_recent_alerts')}</p>
          )}
        </Card>
      </div>

      {/* Power Trend Chart */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.power_24h')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={powerTrendData}>
            <defs>
              <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="power"
              stroke="#f59e0b"
              fillOpacity={1}
              fill="url(#colorPower)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* RUL Forecast (years) */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{locale === 'uk' ? 'Прогноз залишкового ресурсу (роки)' : 'Remaining useful life forecast (years)'}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={rulForecastData}>
            <defs>
              <linearGradient id="colorRul" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" label={{ value: locale === 'uk' ? 'Роки вперед' : 'Years ahead', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: locale === 'uk' ? 'RUL, років' : 'RUL, years', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="upper"
              stroke="transparent"
              fill="transparent"
            />
            <Area
              type="monotone"
              dataKey="rul"
              stroke="#ef4444"
              fillOpacity={0.3}
              fill="url(#colorRul)"
              name={t('turbines.predicted_rul')}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="transparent"
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
