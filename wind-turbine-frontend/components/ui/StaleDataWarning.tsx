/**
 * StaleDataWarning Component
 * Displays a warning when real-time дані is older than a threshold
 */

'use client';

import { AlertTriangle } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface StaleDataWarningProps {
  isStale: boolean;
  minutesOld?: number;
}

export function StaleDataWarning({ isStale, minutesOld = 1 }: StaleDataWarningProps) {
  const t = useT();
  if (!isStale) return null;

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg surface-2 border hairline signal-warn text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{t('common.stale_data', { n: String(minutesOld) })}</span>
    </div>
  );
}
