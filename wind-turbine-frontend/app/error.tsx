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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-foreground mb-4">{t('errors.oops')}</h1>
          <p className="text-lg text-foreground/70 mb-2">{t('errors.something_wrong')}</p>
          <p className="text-sm text-foreground/50 font-mono break-words">{error.message}</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {t('errors.try_again')}
          </button>
          <a
            href="/dashboard"
            className="block w-full px-4 py-2 bg-foreground/10 text-foreground rounded-lg hover:bg-foreground/20 transition-colors font-medium"
          >
            {t('errors.go_dashboard')}
          </a>
        </div>

        {error.digest && (
          <p className="text-xs text-foreground/30 font-mono">{t('errors.error_id')}: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
