'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTurbineList, useTurbineAlerts } from '@/hooks/useTurbineData';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/useToast';
import { KPICard } from '@/components/dashboard/KPICard';
import { AlertsFeed } from '@/components/dashboard/AlertsFeed';
import { TurbineGrid } from '@/components/dashboard/TurbineGrid';
import { SystemMap } from '@/components/dashboard/SystemMap';
import { postApiWithAuth } from '@/lib/api';
import type { Turbine, TurbineRealtimeData } from '@/types/api';
import { useT } from '@/lib/i18n';

export default function DashboardPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [page, setPage] = useState(1);
  const [allTurbines, setAllTurbines] = useState<Turbine[]>([]);

  const { turbines: pageTurbines, total, isLoading: isLoadingTurbines } = useTurbineList({ page, pageSize: 10 });
  const { data: rawAlerts = [], isLoading: isLoadingAlerts } = useTurbineAlerts({ enabled: true });
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const alerts = useMemo(() => rawAlerts.filter((a) => !ackedIds.has(a.id)), [rawAlerts, ackedIds]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const turbineIds = useMemo(() => allTurbines.map((t) => t.turbine_id), [allTurbines]);
  const { isConnected: isRealtimeConnected, getTurbineData } = useRealtime({
    turbineIds,
    autoSubscribe: turbineIds.length > 0,
  });

  useEffect(() => {
    if (!pageTurbines.length) return;
    setAllTurbines((prev) => {
      const fresh = pageTurbines.filter((t) => !prev.find((p) => p.turbine_id === t.turbine_id));
      if (!fresh.length) return prev;
      return [...prev, ...fresh];
    });
  }, [pageTurbines]);

  const onlineTurbines = allTurbines.filter((t) => t.status !== 'offline').length;
  const totalTurbines  = allTurbines.length;
  const totalPower     = allTurbines.reduce((sum, t) => sum + (getTurbineData(t.turbine_id)?.power_kw ?? t.power_kw), 0);
  const avgPower       = totalTurbines ? Math.round(totalPower / totalTurbines) : 0;
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
  const warningAlerts  = alerts.filter((a) => a.severity === 'warning').length;
  const avgRUL         = totalTurbines ? (allTurbines.reduce((s, t) => s + t.rul_years, 0) / totalTurbines) : 0;

  const handleLoadMore = useCallback(() => {
    if (allTurbines.length < total) setPage((p) => p + 1);
  }, [allTurbines.length, total]);

  const handleAck = useCallback(
    async (alertId: string) => {
      // Optimistically remove the alert from the feed so the user sees
      // an immediate response; revert if the backend rejects it.
      setAckedIds((prev) => new Set(prev).add(alertId));
      try {
        await postApiWithAuth(`/alerts/${alertId}/acknowledge`, {});
        success(t('dashboard.alert_acked'));
      } catch (err) {
        setAckedIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
        showError(t('dashboard.alert_ack_failed'));
        console.error(err);
      }
    },
    [success, showError, t]
  );

  const hasMore = allTurbines.length < total;

  // hero metric: total power across fleet (most important number)
  const heroValue = (totalPower / 1000).toFixed(1);

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">

        {/* ─── HERO ──────────────────────────────────────── */}
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pb-12 hairline-b">
          <div className="lg:col-span-7">
            <p className="eyebrow">{t('dashboard.eyebrow')}</p>
            <h1 className="display text-[clamp(3rem,7vw,6rem)] ink-1 mt-3 leading-[0.95] text-balance">
              {t('dashboard.hero.fleet')} <span className="signal-live">{onlineTurbines}</span>
              <span className="ink-4"> / </span>
              <span className="ink-2 tabular">{totalTurbines || '—'}</span>
              <br />
              <span className="ink-3">{t('dashboard.hero.capacity')}</span>
            </h1>
            <p className="text-base ink-3 mt-6 max-w-xl text-pretty leading-relaxed">
              {totalTurbines ? t('dashboard.hero.body', { n: totalTurbines }) : t('dashboard.hero.body_all')}
            </p>
          </div>

          {/* hero metric: total fleet power */}
          <div className="lg:col-span-5 flex flex-col justify-end">
            <div className="surface-1 hairline border rounded-xl p-7 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-30 blur-3xl"
                style={{ background: 'hsl(var(--primary))' }}
              />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">{t('dashboard.fleet_output')}</p>
                  <span className="mono text-[10px] tracking-widest signal-warn flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-warn shimmer" />
                    {t('common.realtime')}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="display text-7xl lg:text-8xl ink-1 tabular">{heroValue}</span>
                  <span className="text-lg ink-3">{t('common.mw')}</span>
                </div>
                <div className="hairline-t mt-6 pt-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="eyebrow">{t('dashboard.avg_unit')}</p>
                    <p className="mono text-sm ink-2 tabular mt-1">{avgPower} {t('common.kw')}</p>
                  </div>
                  <div>
                    <p className="eyebrow">{t('dashboard.avg_rul')}</p>
                    <p className="mono text-sm ink-2 tabular mt-1">{avgRUL.toFixed(1)} {t('common.year_short')}</p>
                  </div>
                  <div>
                    <p className="eyebrow">{t('dashboard.stream')}</p>
                    <p className={`mono text-sm tabular mt-1 ${isRealtimeConnected ? 'signal-live' : 'signal-crit'}`}>
                      {isRealtimeConnected ? t('common.live') : t('common.offline')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ─── KPI BAND ──────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-px surface-2 hairline border-x border-b mt-0">
          <KPICard
            index="01"
            title={t('dashboard.kpi.online')}
            value={onlineTurbines}
            unit={`/ ${totalTurbines || 0}`}
            status={onlineTurbines === totalTurbines && totalTurbines > 0 ? 'healthy' : totalTurbines === 0 ? 'warning' : 'warning'}
            isLoading={isLoadingTurbines && !totalTurbines}
          />
          <KPICard
            index="02"
            title={t('dashboard.kpi.avg_power')}
            value={avgPower}
            unit={t('common.kw')}
            status={avgPower > 500 ? 'healthy' : 'warning'}
            isLoading={isLoadingTurbines && !totalTurbines}
          />
          <KPICard
            index="03"
            title={t('dashboard.kpi.critical')}
            value={criticalAlerts}
            unit={warningAlerts > 0 ? t('dashboard.kpi.warn_suffix', { n: warningAlerts }) : undefined}
            status={criticalAlerts === 0 ? 'healthy' : 'critical'}
            isLoading={isLoadingAlerts}
          />
          <KPICard
            index="04"
            title={t('dashboard.kpi.avg_rul')}
            value={avgRUL.toFixed(1)}
            unit={t('common.years')}
            trend={avgRUL > 5 ? 'stable' : 'down'}
            status={avgRUL > 5 ? 'healthy' : 'warning'}
            isLoading={isLoadingTurbines && !totalTurbines}
          />
        </section>

        {!isRealtimeConnected && (
          <div className="mt-6 px-4 py-3 rounded-md surface-1 hairline border flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-warn shimmer" />
            <p className="mono text-[11px] tracking-widest signal-warn">{t('dashboard.disconnected')}</p>
          </div>
        )}

        {/* ─── BODY ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 mt-16">
          <div className="xl:col-span-4 space-y-12">
            <AlertsFeed alerts={alerts} isLoading={isLoadingAlerts} onAcknowledge={handleAck} />
          </div>

          <div className="xl:col-span-8 space-y-12">
            <TurbineGrid
              turbines={allTurbines}
              isLoading={isLoadingTurbines}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              realtimeData={Object.fromEntries(
                allTurbines
                  .map((t) => [t.turbine_id, getTurbineData(t.turbine_id)] as const)
                  .filter(([, d]) => d !== null) as [string, TurbineRealtimeData][]
              )}
            />

            <SystemMap turbines={allTurbines} isLoading={isLoadingTurbines && !totalTurbines} />
          </div>
        </div>
      </div>
    </div>
  );
}
