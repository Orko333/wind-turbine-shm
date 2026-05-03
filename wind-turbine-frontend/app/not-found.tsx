'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

export default function NotFound() {
  const t = useT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
          <p className="text-lg text-foreground/70 mb-2">{t('errors.not_found')}</p>
          <p className="text-sm text-foreground/50">
            {t('errors.not_found_desc')}
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {t('errors.go_dashboard')}
          </Link>
          <Link
            href="/"
            className="block w-full px-4 py-2 bg-foreground/10 text-foreground rounded-lg hover:bg-foreground/20 transition-colors font-medium"
          >
            {t('errors.go_home')}
          </Link>
        </div>

        <nav className="text-sm space-y-2">
          <p className="text-foreground/50">{t('errors.common_pages')}</p>
          <ul className="space-y-1">
            <li>
              <Link href="/turbines" className="text-blue-600 hover:underline">
                {t('nav.turbines')}
              </Link>
            </li>
            <li>
              <Link href="/scada" className="text-blue-600 hover:underline">
                {t('nav.scada')}
              </Link>
            </li>
            <li>
              <Link href="/fatigue" className="text-blue-600 hover:underline">
                {t('errors.fatigue_analysis')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
