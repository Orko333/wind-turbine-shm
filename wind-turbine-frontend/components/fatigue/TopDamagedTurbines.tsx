'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Section } from '@/components/ui/section';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface TopDamagedTurbinesProps {
  data?: Array<{
    turbine_id: string;
    damage_rate: number;
    rul_years: number;
    health_score: number;
  }>;
  isLoading?: boolean;
}

export function TopDamagedTurbines({ data = [], isLoading }: TopDamagedTurbinesProps) {
  const t = useT();
  const sorted = useMemo(() => [...data].sort((a, b) => b.damage_rate - a.damage_rate), [data]);

  const healthSignal = (s: number) =>
    s >= 80 ? 'signal-live' : s >= 60 ? 'ink-2' : s >= 40 ? 'signal-warn' : 'signal-crit';

  const healthBg = (s: number) =>
    s >= 80 ? 'bg-live' : s >= 60 ? 'bg-[hsl(var(--ink-2))]' : s >= 40 ? 'bg-warn' : 'bg-crit';

  const avgDamage = sorted.length ? (sorted.reduce((s, r) => s + r.damage_rate, 0) / sorted.length) * 100 : 0;
  const avgRUL    = sorted.length ?  sorted.reduce((s, r) => s + r.rul_years, 0) / sorted.length : 0;

  return (
    <Section
      eyebrow={t('fatigue.top.eyebrow')}
      title={t('fatigue.top.title')}
      description={t('fatigue.top.desc')}
      trailing={
        <span className="mono text-[10px] tracking-widest signal-warn tabular">
          TOP {sorted.length.toString().padStart(2, '0')}
        </span>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md hairline border">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 hairline-b mono text-[10px] tracking-widest ink-4 uppercase surface-2">
              <div className="col-span-1">{t('fatigue.top.col.rank')}</div>
              <div className="col-span-2">{t('fatigue.top.col.unit')}</div>
              <div className="col-span-3">{t('fatigue.top.col.damage')}</div>
              <div className="col-span-3">{t('dashboard.rul')}</div>
              <div className="col-span-3">{t('fatigue.top.col.health')}</div>
            </div>

            {sorted.map((row, i) => (
              <div
                key={row.turbine_id}
                className="grid grid-cols-12 gap-4 px-4 py-4 items-center hairline-b last:border-b-0 hover:bg-[hsl(var(--surface-2))] transition-colors"
              >
                <div className="col-span-1">
                  <span className="mono text-xs ink-3 tabular">#{(i + 1).toString().padStart(2, '0')}</span>
                </div>
                <div className="col-span-2">
                  <p className="mono text-sm ink-1 font-medium">{row.turbine_id}</p>
                </div>

                <div className="col-span-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="mono text-base ink-1 tabular">{(row.damage_rate * 100).toFixed(1)}</span>
                    <span className="text-[10px] ink-4">%</span>
                  </div>
                  <div className="mt-1.5 h-0.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-crit"
                      style={{ width: `${Math.min(100, row.damage_rate * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="col-span-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="mono text-base ink-1 tabular">{row.rul_years.toFixed(1)}</span>
                    <span className="text-[10px] ink-4">{t('common.year_short')}</span>
                  </div>
                  <div className="mt-1.5 h-0.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-live"
                      style={{ width: `${Math.min(100, (row.rul_years / 10) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="col-span-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn('mono text-base tabular', healthSignal(row.health_score))}>
                      {row.health_score}
                    </span>
                    <span className="text-[10px] ink-4">/ 100</span>
                  </div>
                  <div className="mt-1.5 h-0.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div
                      className={cn('h-full', healthBg(row.health_score))}
                      style={{ width: `${row.health_score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6 mt-4 mono text-[11px] tabular">
            <span className="ink-3">{t('fatigue.top.fleet_avg')} <span className="ink-1 ml-1">{avgDamage.toFixed(1)}%</span></span>
            <span className="ink-3">{t('fatigue.top.avg_rul')} <span className="ink-1 ml-1">{avgRUL.toFixed(1)}y</span></span>
          </div>
        </>
      )}
    </Section>
  );
}
