'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTurbineData } from '@/hooks/useTurbineData';
import { useRole } from '@/hooks/useRole';
import { TurbineHeader } from '@/components/turbines/TurbineHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export default function TurbineDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;
  const currentTab = params.tab || 'overview';
  const { canEditConfig } = useRole();

  const TABS = [
    { id: 'overview', label: t('turbines.tab.overview') },
    { id: 'fatigue', label: t('turbines.tab.fatigue') },
    { id: 'visualization', label: t('turbines.tab.visualization') },
    { id: 'health', label: t('turbines.tab.health') },
    { id: 'settings', label: t('turbines.tab.settings') },
  ];

  const { turbine, isLoading, error } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-lg surface-2 border hairline p-6">
            <h2 className="text-lg font-semibold signal-crit">
              {t('turbines.error_loading')}
            </h2>
            <p className="text-sm signal-crit mt-1">
              {error.message || t('turbines.error_load_failed')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-96" />
          </div>
        ) : turbine ? (
          <TurbineHeader turbine={turbine} canEdit={canEditConfig()} />
        ) : null}

        {/* Tabs Navigation */}
        {!isLoading && turbine && (
          <div className="flex gap-1 border-b overflow-x-auto">
            {TABS.map((tab) => (
              <Link
                key={tab.id}
                href={`/turbines/${turbineId}/${tab.id}`}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  currentTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        )}

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
