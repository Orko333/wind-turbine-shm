'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Compass, Wind, ArrowRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useRole } from '@/hooks/useRole';
import { useTurbineList } from '@/hooks/useTurbineData';
import { cn } from '@/lib/utils';

interface PaletteItem {
  type: 'page' | 'turbine';
  id: string;
  label: string;
  hint?: string;
  href: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const {
    canViewDashboard, canViewTurbines, canEditConfig,
    canRunSimulations, canViewAnalytics, canAccessAdmin,
  } = useRole();

  const { turbines } = useTurbineList({ pageSize: 50, enabled: open });

  const pages: PaletteItem[] = useMemo(() => {
    const all = [
      { num: '01', key: 'nav.dashboard',   href: '/dashboard',   ok: canViewDashboard?.() ?? true },
      { num: '02', key: 'nav.turbines',    href: '/turbines',    ok: canViewTurbines?.() ?? true },
      { num: '03', key: 'nav.physics',     href: '/physics',     ok: canViewTurbines?.() ?? true },
      { num: '04', key: 'nav.fatigue',     href: '/fatigue',     ok: canViewAnalytics?.() ?? true },
      { num: '05', key: 'nav.ml',          href: '/ml',          ok: canViewAnalytics?.() ?? true },
      { num: '06', key: 'nav.monitoring',  href: '/monitoring',  ok: canViewTurbines?.() ?? true },
      { num: '07', key: 'nav.scada',       href: '/scada',       ok: canViewTurbines?.() ?? true },
      { num: '08', key: 'nav.simulations', href: '/simulations', ok: canRunSimulations?.() ?? true },
      { num: '09', key: 'nav.config',      href: '/config',      ok: canEditConfig?.() ?? true },
      { num: '10', key: 'nav.reports',     href: '/reports',     ok: canViewAnalytics?.() ?? true },
      { num: '11', key: 'nav.admin',       href: '/admin',       ok: canAccessAdmin?.() ?? true },
    ];
    return all.filter((i) => i.ok).map((i) => ({
      type: 'page' as const,
      id: i.href,
      label: t(i.key),
      hint: i.num,
      href: i.href,
    }));
  }, [t, canViewDashboard, canViewTurbines, canEditConfig, canRunSimulations, canViewAnalytics, canAccessAdmin]);

  const turbineItems: PaletteItem[] = useMemo(
    () => (turbines ?? []).map((tb) => ({
      type: 'turbine' as const,
      id: tb.turbine_id,
      label: tb.name || tb.turbine_id,
      hint: tb.turbine_id,
      href: `/turbines/${tb.turbine_id}`,
    })),
    [turbines]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...pages, ...turbineItems];
    if (!q) return all;
    return all.filter((it) => it.label.toLowerCase().includes(q) || it.hint?.toLowerCase().includes(q));
  }, [query, pages, turbineItems]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) {
          router.push(item.href);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, activeIdx, router, onClose]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const pageResults = filtered.filter((i) => i.type === 'page');
  const turbineResults = filtered.filter((i) => i.type === 'turbine');

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-lg surface-1 hairline border shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 20px 80px -20px hsl(var(--primary) / 0.25), 0 0 0 1px hsl(var(--hairline-strong))' }}
      >
        <div className="flex items-center gap-3 px-4 h-12 hairline border-b">
          <Search className="w-4 h-4 ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent border-0 outline-none ink-1 text-sm placeholder:ink-3"
          />
          <kbd className="mono text-[10px] ink-4 px-1.5 py-0.5 rounded surface-3">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto scroll-quiet py-2">
          {filtered.length === 0 && (
            <p className="text-center text-sm ink-3 py-8">{t('palette.empty')}</p>
          )}

          {pageResults.length > 0 && (
            <div className="py-1">
              <p className="eyebrow ink-4 px-4 py-1.5">{t('palette.pages')}</p>
              {pageResults.map((item) => {
                const idx = filtered.indexOf(item);
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => { router.push(item.href); onClose(); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                      isActive ? 'surface-2 ink-1' : 'ink-2 hover:surface-2'
                    )}
                  >
                    <Compass className="w-4 h-4 flex-shrink-0 ink-3" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <span className="mono text-[10px] ink-4">{item.hint}</span>
                    {isActive && <ArrowRight className="w-3.5 h-3.5 signal-warn" />}
                  </button>
                );
              })}
            </div>
          )}

          {turbineResults.length > 0 && (
            <div className="py-1">
              <p className="eyebrow ink-4 px-4 py-1.5">{t('palette.turbines')}</p>
              {turbineResults.map((item) => {
                const idx = filtered.indexOf(item);
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => { router.push(item.href); onClose(); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                      isActive ? 'surface-2 ink-1' : 'ink-2 hover:surface-2'
                    )}
                  >
                    <Wind className="w-4 h-4 flex-shrink-0 signal-live" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <span className="mono text-[10px] ink-4">{item.hint}</span>
                    {isActive && <ArrowRight className="w-3.5 h-3.5 signal-warn" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hairline border-t px-4 py-2 flex items-center gap-4 mono text-[10px] ink-4">
          <span><kbd className="px-1 py-0.5 surface-3 rounded">↑↓</kbd> {t('palette.hint_navigate')}</span>
          <span><kbd className="px-1 py-0.5 surface-3 rounded">⏎</kbd> {t('palette.hint_open')}</span>
          <span className="ml-auto">{filtered.length} {t('palette.results')}</span>
        </div>
      </div>
    </div>
  );
}
