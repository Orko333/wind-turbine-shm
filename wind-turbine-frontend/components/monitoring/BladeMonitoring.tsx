'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface BladeCondition {
  blade_id: string;
  erosion_percent: number;
  ice_accretion_percent: number;
  imbalance_percent: number;
  last_updated: string;
  status: 'healthy' | 'warning' | 'critical';
}

interface BladeMonitoringProps {
  blades?: BladeCondition[];
  isLoading?: boolean;
}

export function BladeMonitoring({
  blades = [
    {
      blade_id: 'Blade 1',
      erosion_percent: 15,
      ice_accretion_percent: 2,
      imbalance_percent: 4.2,
      last_updated: new Date(Date.now() - 300000).toISOString(),
      status: 'healthy',
    },
    {
      blade_id: 'Blade 2',
      erosion_percent: 22,
      ice_accretion_percent: 8,
      imbalance_percent: 6.8,
      last_updated: new Date(Date.now() - 300000).toISOString(),
      status: 'warning',
    },
    {
      blade_id: 'Blade 3',
      erosion_percent: 18,
      ice_accretion_percent: 1,
      imbalance_percent: 3.5,
      last_updated: new Date(Date.now() - 300000).toISOString(),
      status: 'healthy',
    },
  ],
  isLoading = false,
}: BladeMonitoringProps) {
  const t = useT();
  const overallStatus = useMemo(() => {
    if (blades.length === 0) return 'healthy';
    if (blades.some((b) => b.status === 'critical')) return 'critical';
    if (blades.some((b) => b.status === 'warning')) return 'warning';
    return 'healthy';
  }, [blades]);

  const avgErosion = useMemo(() => {
    if (blades.length === 0) return 0;
    return blades.reduce((sum, b) => sum + b.erosion_percent, 0) / blades.length;
  }, [blades]);

  const avgIce = useMemo(() => {
    if (blades.length === 0) return 0;
    return blades.reduce((sum, b) => sum + b.ice_accretion_percent, 0) / blades.length;
  }, [blades]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'surface-2 hairline border';
      case 'warning':
        return 'surface-2 hairline border';
      case 'critical':
        return 'surface-2 hairline border';
      default:
        return 'surface-2 hairline border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 signal-live" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 signal-warn" />;
      case 'critical':
        return <AlertTriangle className="w-5 h-5 signal-crit" />;
      default:
        return null;
    }
  };

  const getProgressBarColor = (value: number, metric: string) => {
    if (metric === 'imbalance') {
      if (value > 7) return 'surface-20';
      if (value > 5) return 'surface-20';
      return 'surface-20';
    }
    // ерозія та лід
    if (value > 25) return 'surface-20';
    if (value > 15) return 'surface-20';
    return 'surface-20';
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('monitoring.blade.title')}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  const statusName = (s: string) =>
    s === 'healthy' ? t('status.healthy') : s === 'warning' ? t('status.warning') : t('status.critical');

  return (
    <div className="space-y-6">
      {/* Загальний підсумок статусу */}
      <Card className="p-6 surface-2 hairline">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t('monitoring.blade.fleet_status')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('monitoring.blade.monitored', { n: blades.length })}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(overallStatus)}
              <Badge variant={overallStatus === 'healthy' ? 'default' : overallStatus === 'warning' ? 'secondary' : 'destructive'}>
                {statusName(overallStatus)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('monitoring.blade.last_update', { n: new Date(blades[0]?.last_updated || Date.now()).toLocaleTimeString() })}
            </p>
          </div>
        </div>
      </Card>

      {/* Середні показники парку */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t('monitoring.blade.avg_erosion')}</p>
            <p className="text-3xl font-bold">{avgErosion.toFixed(1)}%</p>
            <div className="h-2 surface-3 rounded-full overflow-hidden">
              <div
                className="h-full surface-20"
                style={{ width: `${Math.min(avgErosion, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('monitoring.blade.leading_edge')}</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t('monitoring.blade.avg_ice')}</p>
            <p className="text-3xl font-bold">{avgIce.toFixed(1)}%</p>
            <div className="h-2 surface-3 rounded-full overflow-hidden">
              <div
                className="h-full surface-20"
                style={{ width: `${Math.min(avgIce, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('monitoring.blade.surface_cov')}</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t('monitoring.blade.max_imbalance')}</p>
            <p className="text-3xl font-bold">
              {(Math.max(...blades.map((b) => b.imbalance_percent)) || 0).toFixed(1)}%
            </p>
            <div className="h-2 surface-3 rounded-full overflow-hidden">
              <div
                className="h-full surface-20"
                style={{
                  width: `${Math.min((Math.max(...blades.map((b) => b.imbalance_percent)) || 0) / 10 * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('monitoring.blade.imbalance_detect')}</p>
          </div>
        </Card>
      </div>

      {/* Окремі картки лопатей */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {blades.map((blade, idx) => (
          <Card key={blade.blade_id} className={`p-6 border-2 ${getStatusColor(blade.status)}`}>
            <div className="space-y-4">
              {/* Заголовок лопаті */}
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-lg">{t('monitoring.blade.id', { n: idx + 1 })}</h4>
                <div className="flex items-center gap-2">
                  {getStatusIcon(blade.status)}
                  <Badge
                    variant={
                      blade.status === 'healthy'
                        ? 'default'
                        : blade.status === 'warning'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {statusName(blade.status)}
                  </Badge>
                </div>
              </div>

              {/* Ерозія */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('monitoring.blade.erosion')}</span>
                  <span className="text-sm font-bold">{blade.erosion_percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getProgressBarColor(blade.erosion_percent, 'erosion')}`}
                    style={{ width: `${Math.min(blade.erosion_percent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {blade.erosion_percent < 15
                    ? t('monitoring.blade.erosion_good')
                    : blade.erosion_percent < 25
                      ? t('monitoring.blade.erosion_mod')
                      : t('monitoring.blade.erosion_high')}
                </p>
              </div>

              {/* Намерзання льоду */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('monitoring.blade.ice')}</span>
                  <span className="text-sm font-bold">{blade.ice_accretion_percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getProgressBarColor(blade.ice_accretion_percent, 'ice')}`}
                    style={{ width: `${Math.min(blade.ice_accretion_percent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {blade.ice_accretion_percent < 5
                    ? t('monitoring.blade.ice_none')
                    : blade.ice_accretion_percent < 15
                      ? t('monitoring.blade.ice_minor')
                      : t('monitoring.blade.ice_signif')}
                </p>
              </div>

              {/* Дисбаланс */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('monitoring.blade.imbalance')}</span>
                  <span className="text-sm font-bold">{blade.imbalance_percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getProgressBarColor(blade.imbalance_percent, 'imbalance')}`}
                    style={{ width: `${Math.min((blade.imbalance_percent / 10) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {blade.imbalance_percent < 5
                    ? t('monitoring.blade.imbalance_ok')
                    : blade.imbalance_percent < 7
                      ? t('monitoring.blade.imbalance_mon')
                      : t('monitoring.blade.imbalance_reb')}
                </p>
              </div>

              {/* Часова мітка */}
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {t('monitoring.blade.last_updated', { n: new Date(blade.last_updated).toLocaleTimeString() })}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Панель рекомендацій */}
      <Card className="p-6 surface-2 hairline border">
        <div className="space-y-3">
          <h4 className="font-semibold signal-warn">{t('monitoring.blade.recs_title')}</h4>
          <ul className="space-y-2 text-sm signal-warn">
            {blades.filter((b) => b.erosion_percent > 20).length > 0 && (
              <li className="flex gap-2">
                <span className="font-medium">•</span>
                <span>
                  {t('monitoring.blade.rec_erosion', { n: blades.filter((b) => b.erosion_percent > 20).length })}
                </span>
              </li>
            )}
            {blades.filter((b) => b.ice_accretion_percent > 5).length > 0 && (
              <li className="flex gap-2">
                <span className="font-medium">•</span>
                <span>
                  {t('monitoring.blade.rec_ice', { n: blades.filter((b) => b.ice_accretion_percent > 5).length })}
                </span>
              </li>
            )}
            {blades.filter((b) => b.imbalance_percent > 6).length > 0 && (
              <li className="flex gap-2">
                <span className="font-medium">•</span>
                <span>
                  {t('monitoring.blade.rec_imbalance', { n: blades.filter((b) => b.imbalance_percent > 6).length })}
                </span>
              </li>
            )}
            {blades.every((b) => b.status === 'healthy') && (
              <li className="flex gap-2">
                <span className="font-medium">•</span>
                <span>{t('monitoring.blade.rec_all_ok')}</span>
              </li>
            )}
          </ul>
        </div>
      </Card>
    </div>
  );
}
