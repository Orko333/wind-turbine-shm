'use client';

import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Alert } from '@/types/api';

interface AlertsFeedProps {
  alerts: Alert[];
  isLoading?: boolean;
  onAcknowledge?: (alertId: string) => void;
}

type SortBy = 'time' | 'severity';

const sevDot: Record<string, string> = {
  critical: 'bg-crit',
  warning:  'bg-warn',
  info:     'bg-live',
};

const sevColor: Record<string, string> = {
  critical: 'signal-crit',
  warning:  'signal-warn',
  info:     'signal-live',
};

export function AlertsFeed({ alerts, isLoading, onAcknowledge }: AlertsFeedProps) {
  const t = useT();
  const [sortBy, setSortBy] = useState<SortBy>('time');

  const sorted = useMemo(() => {
    const list = alerts.slice(0, 6);
    if (sortBy === 'severity') {
      const order = { critical: 0, warning: 1, info: 2 };
      return [...list].sort(
        (a, b) => (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9)
      );
    }
    return list;
  }, [alerts, sortBy]);

  const formatTime = (s: string) => {
    const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
    if (diff < 60) return t('common.now');
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(s).toLocaleDateString();
  };

  const sortLabels: Record<SortBy, string> = {
    time: t('dashboard.alerts.sort_time'),
    severity: t('dashboard.alerts.sort_severity'),
  };

  return (
    <section>
      <header className="flex items-end justify-between pb-4 hairline-b">
        <div>
          <p className="eyebrow">{t('dashboard.alerts.eyebrow')}</p>
          <h3 className="display text-2xl ink-1 mt-1">{t('dashboard.alerts.title')}</h3>
        </div>
        <div className="flex items-center gap-1">
          {(['time', 'severity'] as SortBy[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={cn(
                'mono text-[10px] tracking-widest px-2.5 py-1 rounded uppercase transition-colors',
                sortBy === opt ? 'ink-1 surface-3' : 'ink-3 hover:ink-2'
              )}
            >
              {sortLabels[opt]}
            </button>
          ))}
        </div>
      </header>

      <div className="divide-y divide-[hsl(var(--hairline))]">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="py-4">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-flex items-center gap-2 mono text-[11px] tracking-widest signal-live">
              <span className="w-1.5 h-1.5 rounded-full bg-live shimmer" />
              {t('dashboard.alerts.empty_label')}
            </div>
            <p className="ink-3 text-xs mt-2">{t('dashboard.alerts.empty_desc')}</p>
          </div>
        ) : (
          sorted.map((alert) => {
            const sev = alert.severity as string;
            return (
              <article key={alert.id} className="py-4 group">
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1.5 w-1.5 h-1.5 flex-shrink-0 rounded-full', sevDot[sev] ?? 'bg-[hsl(var(--ink-4))]')} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="mono text-xs ink-1 font-medium">{alert.turbine_id}</span>
                        <span className={cn('mono text-[9px] tracking-widest uppercase', sevColor[sev] ?? 'ink-4')}>
                          {alert.severity}
                        </span>
                      </div>
                      <span className="mono text-[10px] ink-4 tabular flex-shrink-0">
                        {formatTime(alert.created_at)}
                      </span>
                    </div>

                    <p className="text-sm ink-2 mt-1 leading-relaxed text-pretty">{alert.message}</p>

                    {!alert.acknowledged && (
                      <button
                        onClick={() => onAcknowledge?.(alert.id)}
                        className="mono text-[10px] tracking-widest ink-3 hover:ink-1 mt-2 transition-colors"
                      >
                        {t('common.acknowledge')}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
