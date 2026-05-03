'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function LogoutPage() {
  const t = useT();
  const router = useRouter();
  const { logout, isLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const handleLogout = async () => {
      try {
        setIsProcessing(true);
        setError(null);

        // Call logout from useAuth hook
        await logout();

        if (isMounted) {
          // Redirect to login after logout
          router.push('/login');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage =
            err instanceof Error ? err.message : 'Logout failed';
          setError(errorMessage);
          setIsProcessing(false);
        }
      }
    };

    handleLogout();

    return () => {
      isMounted = false;
    };
  }, [logout, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t('auth.logout_error')}</h1>
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('auth.return_to_login')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        {isProcessing || isLoading ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('auth.signing_out')}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{t('auth.signed_out')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('auth.redirecting')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
