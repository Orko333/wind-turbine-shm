'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TurbineDetail } from '@/types/api';
import { useT } from '@/lib/i18n';

interface TurbineHeaderProps {
  turbine: TurbineDetail;
  onEdit?: () => void;
  canEdit?: boolean;
}

export function TurbineHeader({ turbine, onEdit, canEdit = false }: TurbineHeaderProps) {
  const t = useT();
  const router = useRouter();

  // Форматування часу з моменту останнього оновлення
  const getTimeString = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('turbines.just_now');
    if (diffMins < 60) return t('turbines.minute_ago', { n: diffMins });
    if (diffHours < 24) return t('turbines.hour_ago', { n: diffHours });
    if (diffDays < 7) return t('turbines.day_ago', { n: diffDays });
    return date.toLocaleDateString();
  };

  const lastUpdateTime = getTimeString(turbine.last_update);

  const statusColors = {
    healthy: 'surface-3 signal-live border-green-300',
    warning: 'surface-3 signal-warn border-yellow-300',
    critical: 'surface-3 signal-crit border-red-300',
    offline: 'surface-3 ink-1 hairline',
  };

  const statusLabels: Record<string, string> = {
    healthy: t('status.healthy'),
    warning: t('status.warning'),
    critical: t('status.critical'),
    offline: t('status.offline'),
  };

  return (
    <div className="flex items-start justify-between gap-4 pb-6 border-b">
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('turbines.back')}
        </Button>

        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{turbine.name}</h1>
            <Badge
              variant="outline"
              className={`capitalize font-semibold ${
                statusColors[turbine.status as keyof typeof statusColors]
              }`}
            >
              {statusLabels[turbine.status] || turbine.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t('turbines.id_label')}: {turbine.turbine_id} • {t('turbines.last_update')}: {lastUpdateTime}
          </p>
        </div>
      </div>

      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="gap-2"
        >
          <Edit2 className="w-4 h-4" />
          {t('common.edit')}
        </Button>
      )}
    </div>
  );
}
