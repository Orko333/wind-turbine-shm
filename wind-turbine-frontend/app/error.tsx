'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error('Root error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center surface-1">
      <div className="max-w-md w-full space-y-8 text-center px-6">
        <div>
          <h1 className="display text-6xl ink-1 mb-4">{t('errors.oops')}</h1>
          <p className="text-lg ink-2 mb-2">{t('errors.something_wrong')}</p>
          <p className="text-sm ink-3 mono break-words">{error.message}</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full px-4 py-2 surface-3 ink-1 hairline border border-l-2 rounded-lg hover:surface-2 transition-colors font-medium glow-amber"
            style={{ borderLeftColor: 'hsl(var(--primary))' }}
          >
            {t('errors.try_again')}
          </button>
          <a
            href="/dashboard"
            className="block w-full px-4 py-2 surface-2 ink-2 hairline border rounded-lg hover:surface-3 transition-colors font-medium"
          >
            {t('errors.go_dashboard')}
          </a>
        </div>

        {error.digest && (
          <p className="text-xs ink-3 mono">{t('errors.error_id')}: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
