'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string | number;
  status?: 'healthy' | 'warning' | 'critical';
  isLoading?: boolean;
  size?: 'hero' | 'standard';
  index?: string;
}

export function KPICard({
  title,
  value,
  unit,
  trend,
  trendValue,
  status = 'healthy',
  isLoading,
  size = 'standard',
  index,
}: KPICardProps) {
  const t = useT();
  const statusColor = {
    healthy:  'signal-live',
    warning:  'signal-warn',
    critical: 'signal-crit',
  }[status];

  const statusBg = {
    healthy:  'bg-live',
    warning:  'bg-warn',
    critical: 'bg-crit',
  }[status];

  const statusLabel = {
    healthy:  t('status.nominal'),
    warning:  t('status.attn'),
    critical: t('status.crit'),
  }[status];

  const isHero = size === 'hero';

  return (
    <div className={cn(
      'group relative flex flex-col justify-between',
      isHero ? 'p-7 min-h-[200px]' : 'p-5 min-h-[140px]'
    )}>
      {/* верхній рядок */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {index && <span className="mono text-[10px] ink-4 tracking-wider">{index}</span>}
          <span className="eyebrow">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1 h-1 rounded-full', statusBg)} />
          <span className={cn('mono text-[9px] tracking-widest', statusColor)}>{statusLabel}</span>
        </div>
      </div>

      {/* значення */}
      {isLoading ? (
        <Skeleton className={cn(isHero ? 'h-20 w-44' : 'h-12 w-28')} />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className={cn(
            'display tabular ink-1',
            isHero ? 'text-7xl lg:text-[5.5rem]' : 'text-5xl'
          )}>
            {value}
          </span>
          {unit && (
            <span className={cn('ink-3', isHero ? 'text-base' : 'text-sm')}>{unit}</span>
          )}
        </div>
      )}

      {/* тренд */}
      {!isLoading && trend && trendValue !== undefined && (
        <div className="flex items-center gap-2">
          <span className={cn(
            'mono text-[11px] tabular',
            trend === 'down' ? 'signal-crit' : trend === 'up' ? 'signal-live' : 'ink-3'
          )}>
            {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'} {trendValue}
          </span>
        </div>
      )}
    </div>
  );
}
