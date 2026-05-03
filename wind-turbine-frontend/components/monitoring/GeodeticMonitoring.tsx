'use client';

import { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface SettlementDataPoint {
  month: number;
  settlement_mm: number;
  date: string;
  temperature_c: number;
}

interface GeodeticData {
  settlement_trend: SettlementDataPoint[];
  current_settlement_mm: number;
  settlement_rate_mm_per_month: number;
  tilt_angle_deg: number;
  tilt_direction: string;
  stability_assessment: 'stable' | 'monitoring' | 'critical';
  last_survey_date: string;
}

interface GeodeticMonitoringProps {
  data?: GeodeticData;
  isLoading?: boolean;
}

export function GeodeticMonitoring({
  data = {
    settlement_trend: [
      { month: 0, settlement_mm: 0, date: '2021-05', temperature_c: 12 },
      { month: 3, settlement_mm: 2.1, date: '2021-08', temperature_c: 18 },
      { month: 6, settlement_mm: 4.5, date: '2021-11', temperature_c: 8 },
      { month: 9, settlement_mm: 7.2, date: '2022-02', temperature_c: 3 },
      { month: 12, settlement_mm: 9.8, date: '2022-05', temperature_c: 15 },
      { month: 15, settlement_mm: 11.5, date: '2022-08', temperature_c: 19 },
      { month: 18, settlement_mm: 13.1, date: '2022-11', temperature_c: 7 },
      { month: 21, settlement_mm: 14.3, date: '2023-02', temperature_c: 2 },
      { month: 24, settlement_mm: 15.8, date: '2023-05', temperature_c: 16 },
      { month: 27, settlement_mm: 16.9, date: '2023-08', temperature_c: 20 },
      { month: 30, settlement_mm: 17.6, date: '2023-11', temperature_c: 6 },
      { month: 33, settlement_mm: 18.2, date: '2024-02', temperature_c: 4 },
      { month: 36, settlement_mm: 18.5, date: '2024-05', temperature_c: 17 },
    ],
    current_settlement_mm: 18.5,
    settlement_rate_mm_per_month: 0.51,
    tilt_angle_deg: 0.32,
    tilt_direction: 'Північний Схід',
    stability_assessment: 'stable',
    last_survey_date: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  isLoading = false,
}: GeodeticMonitoringProps) {
  const t = useT();
  const settlementThreshold = 25.0; // мм
  const tiltThreshold = 0.5; // градуси
  const rateThreshold = 0.75; // мм/місяць

  const settlementStatus = useMemo(() => {
    if (data.current_settlement_mm > settlementThreshold) return 'critical';
    if (data.current_settlement_mm > settlementThreshold * 0.7) return 'warning';
    return 'healthy';
  }, [data.current_settlement_mm]);

  const tiltStatus = useMemo(() => {
    if (data.tilt_angle_deg > tiltThreshold) return 'critical';
    if (data.tilt_angle_deg > tiltThreshold * 0.6) return 'warning';
    return 'healthy';
  }, [data.tilt_angle_deg]);

  const rateStatus = useMemo(() => {
    if (data.settlement_rate_mm_per_month > rateThreshold) return 'critical';
    if (data.settlement_rate_mm_per_month > rateThreshold * 0.7) return 'warning';
    return 'healthy';
  }, [data.settlement_rate_mm_per_month]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default">{t('status.healthy')}</Badge>;
      case 'warning':
        return <Badge variant="secondary">{t('status.warning')}</Badge>;
      case 'critical':
        return <Badge variant="destructive">{t('status.critical')}</Badge>;
      default:
        return <Badge>{t('monitoring.geodetic.unknown')}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('monitoring.geodetic.title')}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Загальний статус */}
      <Card className="p-6 surface-2 hairline">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t('monitoring.geodetic.foundation')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.geodetic.foundation_desc')}
            </p>
          </div>
          <div className="text-right">
            <div className="mb-2">
              {getStatusBadge(data.stability_assessment)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('monitoring.geodetic.last_survey', { n: new Date(data.last_survey_date).toLocaleDateString() })}
            </p>
          </div>
        </div>
      </Card>

      {/* Графік тренду осідання */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{t('monitoring.geodetic.trend_title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.geodetic.trend_desc')}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={data.settlement_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                label={{ value: t('monitoring.geodetic.date'), position: 'insideBottomRight', offset: -10 }}
              />
              <YAxis
                yAxisId="left"
                label={{ value: t('monitoring.geodetic.settlement_axis'), angle: -90, position: 'insideLeft' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: t('monitoring.geodetic.temp_axis'), angle: 90, position: 'insideRight' }}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(26 8% 11%)",
                  border: "1px solid hsl(28 8% 22%)",
                  borderRadius: '4px',
                }}
              />
              <Legend />
              <ReferenceLine
                yAxisId="left"
                y={settlementThreshold}
                stroke="hsl(6 72% 62%)"
                strokeDasharray="5 5"
                label={{
                  value: t('monitoring.geodetic.critical_label', { n: settlementThreshold }),
                  position: 'right',
                  fill: '#ef4444',
                  fontSize: 12,
                }}
              />
              <Bar yAxisId="right" dataKey="temperature_c" fill="hsl(38 90% 58%)" name={t('monitoring.geodetic.temperature')} opacity={0.4} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="settlement_mm"
                stroke="hsl(280 35% 65%)"
                strokeWidth={2}
                name={t('monitoring.geodetic.settlement')}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Інформація про осідання */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('monitoring.geodetic.total')}</p>
              <p className="text-2xl font-bold">{data.current_settlement_mm.toFixed(1)} mm</p>
              <p className="text-xs text-muted-foreground mt-2">
                {settlementStatus === 'healthy'
                  ? t('monitoring.geodetic.within')
                  : settlementStatus === 'warning'
                    ? t('monitoring.geodetic.approaching')
                    : t('monitoring.geodetic.exceeds')}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('monitoring.geodetic.rate')}</p>
              <p className="text-2xl font-bold">{data.settlement_rate_mm_per_month.toFixed(2)} mm/mo</p>
              <p className="text-xs text-muted-foreground mt-2">
                {rateStatus === 'healthy'
                  ? t('monitoring.geodetic.rate_normal')
                  : rateStatus === 'warning'
                    ? t('monitoring.geodetic.rate_elevated')
                    : t('monitoring.geodetic.rate_abnormal')}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('monitoring.geodetic.rate_status')}</p>
              <div className="flex items-center gap-2 mt-2">
                {rateStatus === 'healthy' ? (
                  <CheckCircle className="w-5 h-5 signal-live" />
                ) : (
                  <AlertTriangle className="w-5 h-5 signal-warn" />
                )}
                {getStatusBadge(rateStatus)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Моніторинг кута нахилу */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Індикатор нахилу */}
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">{t('monitoring.geodetic.tilt_title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('monitoring.geodetic.tilt_desc')}
              </p>
            </div>

            {/* Візуалізація компасу */}
            <div className="flex flex-col items-center space-y-6">
              {/* Кругова діаграма нахилу */}
              <div className="relative w-40 h-40 rounded-full border-4 hairline surface-2 flex items-center justify-center">
                <svg
                  className="absolute w-32 h-32"
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Коло */}
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#d1d5db" strokeWidth="1" />
                  {/* Сторони світу */}
                  <text
                    x="50"
                    y="10"
                    textAnchor="middle"
                    className="text-xs font-medium"
                    fill="#6b7280"
                  >
                    N
                  </text>
                  <text
                    x="90"
                    y="53"
                    textAnchor="start"
                    className="text-xs font-medium"
                    fill="#6b7280"
                  >
                    E
                  </text>
                  <text
                    x="50"
                    y="95"
                    textAnchor="middle"
                    className="text-xs font-medium"
                    fill="#6b7280"
                  >
                    S
                  </text>
                  <text
                    x="10"
                    y="53"
                    textAnchor="end"
                    className="text-xs font-medium"
                    fill="#6b7280"
                  >
                    W
                  </text>
                  {/* Вектор нахилу */}
                  <g transform={`rotate(${data.tilt_angle_deg * 10} 50 50)`}>
                    <line
                      x1="50"
                      y1="50"
                      x2="50"
                      y2="15"
                      stroke="hsl(280 35% 65%)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <polygon
                      points="50,10 48,18 52,18"
                      fill="hsl(280 35% 65%)"
                    />
                  </g>
                </svg>
              </div>

              {/* Значення нахилу */}
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <span className="font-medium">{t('monitoring.geodetic.tilt_angle')}</span>
                  <span className="text-lg font-bold">{data.tilt_angle_deg.toFixed(2)}°</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <span className="font-medium">{t('monitoring.geodetic.direction')}</span>
                  <span className="text-lg font-bold">{data.tilt_direction === 'Північний Схід' ? t('monitoring.geodetic.dir_northeast') : data.tilt_direction}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <span className="font-medium">{t('common.status')}</span>
                  <div>{getStatusBadge(tiltStatus)}</div>
                </div>
              </div>

              {/* Шкала нахилу */}
              <div className="w-full space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                  <span>{t('monitoring.geodetic.safe')}</span>
                  <span>{t('monitoring.geodetic.caution')}</span>
                  <span>{t('monitoring.geodetic.critical')}</span>
                </div>
                <div className="h-3 surface-3 rounded-full overflow-hidden flex">
                  <div className="flex-1 surface-20" />
                  <div className="flex-1 surface-20" />
                  <div className="flex-1 surface-20" />
                </div>
                <div
                  className="relative h-4 -mt-4"
                  style={{
                    paddingLeft: `${Math.min((data.tilt_angle_deg / tiltThreshold) * 100, 100)}%`,
                  }}
                >
                  <div className="w-4 h-4 bg-purple-600 rounded-full shadow-md" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Оцінка стабільності */}
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">{t('monitoring.geodetic.stab_title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('monitoring.geodetic.stab_desc')}
              </p>
            </div>

            {/* Картки статусу */}
            <div className="space-y-3">
              <div className={`p-4 rounded-lg border-2 ${
                settlementStatus === 'healthy'
                  ? 'surface-2 hairline border'
                  : settlementStatus === 'warning'
                    ? 'surface-2 hairline border'
                    : 'surface-2 hairline border'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{t('monitoring.geodetic.settlement_short')}</span>
                  {getStatusBadge(settlementStatus)}
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      settlementStatus === 'healthy'
                        ? 'surface-20'
                        : settlementStatus === 'warning'
                          ? 'surface-20'
                          : 'surface-20'
                    }`}
                    style={{
                      width: `${Math.min((data.current_settlement_mm / settlementThreshold) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.current_settlement_mm.toFixed(1)}mm / {settlementThreshold.toFixed(1)}mm limit
                </p>
              </div>

              <div className={`p-4 rounded-lg border-2 ${
                tiltStatus === 'healthy'
                  ? 'surface-2 hairline border'
                  : tiltStatus === 'warning'
                    ? 'surface-2 hairline border'
                    : 'surface-2 hairline border'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{t('monitoring.geodetic.tilt_angle')}</span>
                  {getStatusBadge(tiltStatus)}
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      tiltStatus === 'healthy'
                        ? 'surface-20'
                        : tiltStatus === 'warning'
                          ? 'surface-20'
                          : 'surface-20'
                    }`}
                    style={{
                      width: `${Math.min((data.tilt_angle_deg / tiltThreshold) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.tilt_angle_deg.toFixed(2)}° / {tiltThreshold.toFixed(2)}° limit
                </p>
              </div>

              <div className={`p-4 rounded-lg border-2 ${
                rateStatus === 'healthy'
                  ? 'surface-2 hairline border'
                  : rateStatus === 'warning'
                    ? 'surface-2 hairline border'
                    : 'surface-2 hairline border'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{t('monitoring.geodetic.rate')}</span>
                  {getStatusBadge(rateStatus)}
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      rateStatus === 'healthy'
                        ? 'surface-20'
                        : rateStatus === 'warning'
                          ? 'surface-20'
                          : 'surface-20'
                    }`}
                    style={{
                      width: `${Math.min((data.settlement_rate_mm_per_month / rateThreshold) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.settlement_rate_mm_per_month.toFixed(2)}mm/month / {rateThreshold.toFixed(2)}mm/month limit
                </p>
              </div>
            </div>

            {/* Підсумок оцінки */}
            <div className="p-4 rounded-lg surface-2 border hairline">
              <p className="text-sm font-medium ink-1 mb-2">{t('monitoring.geodetic.assessment')}</p>
              <p className="text-sm ink-2">
                {data.stability_assessment === 'stable'
                  ? t('monitoring.geodetic.assess_stable')
                  : data.stability_assessment === 'monitoring'
                    ? t('monitoring.geodetic.assess_monitor')
                    : t('monitoring.geodetic.assess_critical')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
