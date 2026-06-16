'use client';

// Верхня навігація застосунку.
// Містить логотип, нумеровані пункти меню, перемикач мов, годинник UTC,
// індикатор підключення та аватар оператора. Перекладається через useT().

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { useRealtimeStore } from '@/store/realtime';
import { useAuthStore } from '@/store/auth';
import { Search, Menu, X, ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CommandPalette } from './CommandPalette';

interface NavItem {
  labelKey: string;   // ключ перекладу для назви пункту
  href: string;
  num: string;
  permission?: () => boolean;
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const pathname = usePathname();
  const now = useNow();
  const t = useT();
  const { isConnected, connectionError } = useRealtimeStore();
  const {
    role,
    canViewDashboard, canViewTurbines, canViewAnalytics,
  } = useRole();

  const router = useRouter();
  const { logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    try {
      await logout();
    } catch (e) {
      console.error('Logout failed', e);
    }
    router.push('/login');
  };

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allItems: NavItem[] = [
    { num: '01', labelKey: 'nav.dashboard', href: '/dashboard', permission: canViewDashboard },
    { num: '02', labelKey: 'nav.turbines',  href: '/turbines',  permission: canViewTurbines },
    { num: '03', labelKey: 'nav.fatigue',   href: '/fatigue',   permission: canViewAnalytics },
    { num: '04', labelKey: 'nav.scada',     href: '/scada',     permission: canViewTurbines },
    { num: '05', labelKey: 'nav.reports',   href: '/reports',   permission: canViewAnalytics },
  ];

  const visible = allItems.filter((i) => i.permission?.() ?? true);
  // Перші 7 пунктів — у головній смузі, решта — у дропдауні «More».
  const primary = visible.slice(0, 7);
  const overflow = visible.slice(7);

  // Закриваємо «More» по кліку поза його межами.
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  // Поточний стан підключення → колір/підпис.
  const connectState =
    isConnected ? 'live' : connectionError ? 'reconnect' : 'offline';
  const connectDot   = { live: 'bg-live',     reconnect: 'bg-warn',     offline: 'bg-crit'    }[connectState];
  const connectLabel = { live: t('common.live'), reconnect: t('common.retry'), offline: t('common.offline') }[connectState];
  const connectColor = { live: 'signal-live', reconnect: 'signal-warn', offline: 'signal-crit' }[connectState];

  if (!role) return null;

  return (
    <>
      <header
        className="sticky top-0 z-40 hairline-b"
        style={{
          backdropFilter: 'blur(14px)',
          background: 'hsl(var(--background) / 0.78)',
        }}
      >
        <div className="flex items-center h-14 px-6 lg:px-8 gap-6 max-w-[1900px] mx-auto">
          {/* ── Логотип ────────────────────────────────── */}
          <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <span className="display text-xl ink-1 leading-none">{t('brand.name')}</span>
            <span className="w-1 h-1 rounded-full bg-warn shimmer mb-1.5" />
          </Link>

          <span className="hairline-l h-6 hidden md:block" />

          {/* ── Основна навігація (десктоп) ────────────── */}
          <nav className="hidden md:flex items-center flex-1 min-w-0">
            <ul className="flex items-center gap-0.5">
              {primary.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item.href)} label={t(item.labelKey)} />
                </li>
              ))}

              {overflow.length > 0 && (
                <li className="relative" ref={moreRef}>
                  <button
                    onClick={() => setMoreOpen((v) => !v)}
                    className={cn(
                      'group flex items-center gap-1 px-3 h-9 rounded-md transition-colors',
                      'mono text-[11px] tracking-widest uppercase',
                      moreOpen || overflow.some((o) => isActive(o.href))
                        ? 'ink-1 surface-2'
                        : 'ink-3 hover:ink-1 hover:bg-[hsl(var(--surface-2)/0.6)]'
                    )}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                  >
                    {t('nav.more')}
                    <ChevronDown className={cn('w-3 h-3 transition-transform', moreOpen && 'rotate-180')} />
                  </button>

                  {moreOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-56 rounded-lg surface-1 hairline border overflow-hidden shadow-2xl"
                      style={{ boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6)' }}
                    >
                      <div className="p-1">
                        {overflow.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                              isActive(item.href)
                                ? 'ink-1 surface-2'
                                : 'ink-2 hover:ink-1 hover:bg-[hsl(var(--surface-2)/0.6)]'
                            )}
                            role="menuitem"
                          >
                            <span className={cn(
                              'mono text-[10px] tabular tracking-wider w-5',
                              isActive(item.href) ? 'signal-warn' : 'ink-4'
                            )}>
                              {item.num}
                            </span>
                            <span className="text-[13px]">{t(item.labelKey)}</span>
                            {isActive(item.href) && (
                              <span className="ml-auto w-1 h-1 rounded-full bg-warn" />
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              )}
            </ul>
          </nav>

          {/* ── Права секція ───────────────────────────── */}
          <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-auto">
            <LanguageSwitcher />

            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 h-9 px-3 rounded-md surface-1 hairline border ink-3 hover:ink-1 hover:border-[hsl(var(--ink-4))] transition-colors"
              aria-label={t('common.search')}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-xs">{t('common.search')}</span>
              <kbd className="mono text-[10px] ink-4 ml-2 px-1.5 py-0.5 rounded surface-3">⌘K</kbd>
            </button>

            <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-md surface-1 hairline border">
              <span className="eyebrow ink-4">{t('common.utc')}</span>
              <span className="mono text-xs ink-2 tabular" suppressHydrationWarning>{now ? now.toISOString().slice(11, 19) : '--:--:--'}</span>
            </div>

            <div className={cn(
              'flex items-center gap-2 px-3 h-9 rounded-md surface-1 hairline border',
              isConnected && 'glow-live'
            )}>
              <div className={cn('relative w-1.5 h-1.5 rounded-full', connectDot)}>
                {isConnected && <span className="absolute inset-0 rounded-full bg-live opacity-50 animate-ping" />}
              </div>
              <span className={cn('mono text-[10px] tracking-widest', connectColor)}>{connectLabel}</span>
            </div>

            <div ref={userMenuRef} className="relative flex items-center pl-3 border-l hairline">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <div className="text-right leading-tight">
                  <p className="eyebrow ink-4 leading-none">{t('common.operator').slice(0, 2)}</p>
                  <p className="text-xs ink-1 capitalize mt-0.5 leading-none">{role}</p>
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold mono"
                  style={{
                    background: 'hsl(var(--primary) / 0.15)',
                    color: 'hsl(var(--primary))',
                    border: '1px solid hsl(var(--primary) / 0.3)',
                  }}
                >
                  {role.slice(0, 2).toUpperCase()}
                </div>
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 surface-1 hairline border rounded-md shadow-xl overflow-hidden z-50"
                  style={{ boxShadow: '0 16px 40px -12px hsl(var(--primary) / 0.2)' }}
                >
                  <div className="px-3 py-2 hairline-b">
                    <p className="eyebrow ink-4">{t('common.operator')}</p>
                    <p className="text-sm ink-1 capitalize mt-0.5">{role}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm ink-2 hover:surface-2 hover:ink-1 transition-colors"
                    role="menuitem"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('user_menu.sign_out')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Мобільний тригер ───────────────────────── */}
          <button
            className="md:hidden ml-auto w-9 h-9 flex items-center justify-center rounded-md surface-1 hairline border ink-2"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* ── Підрядок з хлібними крихтами (тільки lg+) ── */}
        <SubBar pathname={pathname} t={t} />
      </header>

      {/* ── Мобільне меню ────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <nav
            className="relative ml-auto h-full w-72 surface-1 hairline border-l flex flex-col p-5"
            style={{ background: 'linear-gradient(180deg, hsl(var(--surface-1)) 0%, hsl(var(--background)) 100%)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <Link href="/dashboard" className="flex items-baseline gap-1.5">
                <span className="display text-xl ink-1">{t('brand.name')}</span>
                <span className="w-1 h-1 rounded-full bg-warn shimmer mb-1" />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center ink-2"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ul className="space-y-0.5 flex-1 overflow-y-auto scroll-quiet">
              {visible.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                      isActive(item.href)
                        ? 'ink-1 surface-2 border hairline'
                        : 'ink-3 hover:ink-1 hover:bg-[hsl(var(--surface-2)/0.6)]'
                    )}
                  >
                    <span className={cn(
                      'mono text-[10px] tabular tracking-wider w-5',
                      isActive(item.href) ? 'signal-warn' : 'ink-4'
                    )}>
                      {item.num}
                    </span>
                    <span className="text-sm">{t(item.labelKey)}</span>
                    {isActive(item.href) && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-warn" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="pt-4 mt-4 hairline-t flex items-center justify-between gap-3">
              <LanguageSwitcher />
              <div>
                <p className="eyebrow">{t('common.operator')}</p>
                <p className="text-sm ink-1 capitalize mt-1">{role}</p>
              </div>
            </div>
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 surface-2 hairline border rounded text-sm ink-2 hover:ink-1 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t('user_menu.sign_out')}
            </button>
          </nav>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

function NavLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-9 rounded-md transition-colors',
        active ? 'ink-1' : 'ink-3 hover:ink-1'
      )}
    >
      <span className={cn(
        'mono text-[9px] tabular tracking-wider opacity-70 transition-opacity group-hover:opacity-100',
        active && 'signal-warn opacity-100'
      )}>
        {item.num}
      </span>
      <span className="text-[13px] tracking-tight">{label}</span>

      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 -bottom-px h-px"
          style={{
            background: 'hsl(var(--primary))',
            boxShadow: '0 0 8px hsl(var(--primary) / 0.6)',
          }}
        />
      )}
    </Link>
  );
}

// Назви розділів для хлібних крихт. Ключі співпадають із сегментами URL.
const segmentKeys: Record<string, string> = {
  dashboard: 'nav.dashboard',
  turbines: 'nav.turbines',
  physics: 'nav.physics',
  fatigue: 'nav.fatigue',
  ml: 'nav.ml_full',
  monitoring: 'nav.monitoring',
  scada: 'nav.scada',
  simulations: 'nav.simulations',
  config: 'nav.config_full',
  reports: 'nav.reports',
  admin: 'nav.admin',
  overview: 'nav.overview',
  health: 'nav.health',
  visualization: 'nav.visualization',
  settings: 'nav.settings',
};

function SubBar({ pathname, t }: { pathname: string; t: (k: string) => string }) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;

  return (
    <div className="hidden lg:block hairline-t">
      <div className="flex items-center h-9 px-6 lg:px-8 max-w-[1900px] mx-auto">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="eyebrow ink-4">{t('common.path')}</span>
          <span className="hairline-l h-3 mx-2" />
          {segs.map((seg, i) => {
            const last = i === segs.length - 1;
            const href = '/' + segs.slice(0, i + 1).join('/');
            const text = segmentKeys[seg] ? t(segmentKeys[seg]) : seg;
            return (
              <span key={href} className="flex items-center gap-1.5">
                {i > 0 && <span className="ink-4">/</span>}
                {last ? (
                  <span className="ink-1 font-medium tracking-tight">{text}</span>
                ) : (
                  <Link href={href} className="ink-3 hover:ink-2 transition-colors">{text}</Link>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
