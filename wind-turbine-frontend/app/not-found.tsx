'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

export default function NotFound() {
  const t = useT();
  return (
    <div className="min-h-screen flex items-center justify-center surface-1">
      <div className="max-w-md w-full space-y-8 text-center px-6">
        <div>
          <h1 className="display text-6xl ink-1 mb-4">404</h1>
          <p className="text-lg ink-2 mb-2">{t('errors.not_found')}</p>
          <p className="text-sm ink-3">
            {t('errors.not_found_desc')}
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full px-4 py-2 surface-3 ink-1 hairline border border-l-2 rounded-lg hover:surface-2 transition-colors font-medium glow-amber"
            style={{ borderLeftColor: 'hsl(var(--primary))' }}
          >
            {t('errors.go_dashboard')}
          </Link>
          <Link
            href="/"
            className="block w-full px-4 py-2 surface-2 ink-2 hairline border rounded-lg hover:surface-3 transition-colors font-medium"
          >
            {t('errors.go_home')}
          </Link>
        </div>

        <nav className="text-sm space-y-2">
          <p className="ink-3">{t('errors.common_pages')}</p>
          <ul className="space-y-1">
            <li>
              <Link href="/turbines" className="signal-warn hover:underline">
                {t('nav.turbines')}
              </Link>
            </li>
            <li>
              <Link href="/scada" className="signal-warn hover:underline">
                {t('nav.scada')}
              </Link>
            </li>
            <li>
              <Link href="/fatigue" className="signal-warn hover:underline">
                {t('errors.fatigue_analysis')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
