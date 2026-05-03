'use client';

import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface ConnectionStatusProps {
  isConnected: boolean;
  lastUpdate?: string;
  connectionError?: string | null;
}

function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return `${Math.max(0, diffSecs)}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return 'N/A';
}

export function ConnectionStatus({
  isConnected,
  lastUpdate,
  connectionError,
}: ConnectionStatusProps) {
  const t = useT();
  const statusColor = isConnected ? 'surface-20' : 'surface-20';
  const statusText = isConnected ? t('common.connected') : t('common.disconnected');
  const statusBgColor = isConnected
    ? 'surface-2 hairline border'
    : 'surface-2 hairline border';

  const freshness =
    lastUpdate && isConnected
      ? formatRelativeTime(lastUpdate)
      : t('common.no_data');

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-lg border',
        statusBgColor
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Circle
            className={cn('w-3 h-3 fill-current', statusColor)}
            style={{ color: isConnected ? '#22c55e' : '#ef4444' }}
          />
          <span className={cn(
            'text-sm font-medium',
            isConnected ? 'signal-live' : 'signal-crit'
          )}>
            {statusText}
          </span>
        </div>
        {connectionError && (
          <span className="text-xs signal-crit">
            {connectionError}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {lastUpdate && (
          <div>
            <span className="font-medium">{t('scada.realtime.last_update_short')}:</span>
            {' '}
            {formatRelativeTime(lastUpdate)}
          </div>
        )}
        <div>
          <span className="font-medium">{t('scada.realtime.freshness')}:</span>
          {' '}
          {freshness}
        </div>
      </div>
    </div>
  );
}
