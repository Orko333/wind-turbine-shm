'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';

function useNow() {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopNav() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const now = useNow();
  const t = useT();

  const labelBySegment: Record<string, string> = {
    dashboard: t('nav.dashboard'),
    turbines: t('nav.turbines'),
    physics: t('nav.physics'),
    fatigue: t('nav.fatigue'),
    ml: t('nav.ml_full'),
    monitoring: t('nav.monitoring'),
    scada: t('nav.scada'),
    simulations: t('nav.simulations'),
    config: t('nav.config_full'),
    reports: t('nav.reports'),
    admin: t('nav.admin'),
    overview: t('nav.overview'),
    health: t('nav.health'),
    visualization: t('nav.visualization'),
    settings: t('nav.settings'),
  };

  return (
    <header className="sticky top-0 z-30 hairline-b">
      <div
        className="flex items-center justify-between h-14 px-6 lg:px-10"
        style={{
          backdropFilter: 'blur(8px)',
          background: 'hsl(var(--background) / 0.7)',
        }}
      >
        {/* Хлібні крихти */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="eyebrow ink-4">{t('common.path')}</span>
          <span className="w-px h-3 bg-[hsl(var(--hairline-strong))] mx-2" />
          {segments.length === 0 ? (
            <span className="ink-2">{t('nav.home')}</span>
          ) : (
            segments.map((seg, i) => {
              const last = i === segments.length - 1;
              const href = '/' + segments.slice(0, i + 1).join('/');
              const text = labelBySegment[seg] ?? seg;
              return (
                <span key={href} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 ink-4" />}
                  {last ? (
                    <span className="ink-1 font-medium tracking-tight">{text}</span>
                  ) : (
                    <Link href={href} className="ink-3 hover:ink-2 transition-colors">{text}</Link>
                  )}
                </span>
              );
            })
          )}
        </nav>

        {/* Права група */}
        <div className="flex items-center gap-3">
          <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md surface-2 hairline border ink-3 hover:ink-2 transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">{t('common.search')}</span>
            <kbd className="mono text-[10px] ink-4 ml-2 px-1.5 py-0.5 rounded surface-3">⌘K</kbd>
          </button>

          <div className="hidden md:flex items-center gap-2">
            <span className="eyebrow ink-4">{t('common.utc')}</span>
            <span className="mono text-xs ink-2 tabular">
              {now.toISOString().slice(11, 19)}
            </span>
          </div>

          <ConnectionIndicator />
        </div>
      </div>
    </header>
  );
}
