'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Turbine, TurbineRealtimeData } from '@/types/api';

interface TurbineGridProps {
  turbines: Turbine[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  realtimeData?: Record<string, TurbineRealtimeData>;
}

const statusBg: Record<string, string> = {
  healthy:  'bg-live',
  warning:  'bg-warn',
  critical: 'bg-crit',
  offline:  'bg-[hsl(var(--ink-4))]',
};

const statusColor: Record<string, string> = {
  healthy:  'signal-live',
  warning:  'signal-warn',
  critical: 'signal-crit',
  offline:  'ink-4',
};

export function TurbineGrid({
  turbines,
  isLoading,
  onLoadMore,
  hasMore = true,
  realtimeData = {},
}: TurbineGridProps) {
  const t = useT();
  const router = useRouter();
  const observer = useRef<HTMLDivElement>(null);

  const statusLabel: Record<string, string> = {
    healthy:  t('status.ok'),
    warning:  t('status.warn'),
    critical: t('status.crit'),
    offline:  t('status.off'),
  };

  useEffect(() => {
    if (!observer.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading && onLoadMore) onLoadMore();
      },
      { threshold: 0.1 }
    );
    io.observe(observer.current);
    return () => io.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  const open = useCallback((id: string) => router.push(`/turbines/${id}`), [router]);

  return (
    <section>
      <header className="flex items-end justify-between pb-4 hairline-b mb-2">
        <div>
          <p className="eyebrow">{t('dashboard.grid.eyebrow')}</p>
          <h3 className="display text-2xl ink-1 mt-1">{t('dashboard.grid.title')}</h3>
        </div>
        <p className="mono text-[10px] tracking-widest ink-3 tabular">
          {t('dashboard.grid.units', { n: turbines.length.toString().padStart(3, '0') })}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px surface-2 hairline border rounded-lg overflow-hidden">
        {isLoading && !turbines.length
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 surface-1">
                <Skeleton className="h-24 w-full" />
              </div>
            ))
          : turbines.map((turbine) => {
              const rt = realtimeData[turbine.turbine_id];
              const power = rt?.power_kw ?? turbine.power_kw;
              const wind = rt?.wind_speed_ms;
              const status = (turbine.status as string) in statusBg ? turbine.status : 'offline';

              return (
                <button
                  key={turbine.turbine_id}
                  onClick={() => open(turbine.turbine_id)}
                  className={cn(
                    'relative p-4 text-left transition-all duration-200 surface-1',
                    'hover:bg-[hsl(var(--surface-2))]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--primary))]',
                    'cursor-pointer group'
                  )}
                >
                  {/* верх: id + статус */}
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="mono text-xs ink-1 font-medium tracking-tight">{turbine.turbine_id}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full', statusBg[status])} />
                      <span className={cn('mono text-[9px] tracking-widest', statusColor[status])}>
                        {statusLabel[status]}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs ink-3 truncate mb-4">{turbine.name}</p>

                  {/* рядок потужності — основний */}
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="display text-3xl ink-1 tabular">{Math.round(power)}</span>
                    <span className="text-xs ink-3">{t('common.kw')}</span>
                  </div>

                  {/* рядок мета-інформації */}
                  <div className="flex items-center justify-between text-[11px] mono">
                    {wind !== undefined && (
                      <span className="ink-3 tabular">{wind.toFixed(1)} m/s</span>
                    )}
                    <span className="ink-3 tabular ml-auto">{t('dashboard.rul')} {turbine.rul_years.toFixed(1)}y</span>
                  </div>

                  {/* стрілка при наведенні */}
                  <span className="absolute top-3 right-3 mono text-[10px] ink-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    →
                  </span>
                </button>
              );
            })}
      </div>

      {hasMore && (
        <div ref={observer} className="py-3 flex justify-center">
          {isLoading && (
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-[hsl(var(--ink-4))] shimmer"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!isLoading && turbines.length === 0 && (
        <div className="py-16 text-center">
          <p className="mono text-[11px] tracking-widest ink-3">{t('dashboard.grid.empty')}</p>
        </div>
      )}
    </section>
  );
}
