'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoginForm } from '@/components/forms/LoginForm';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [clientLoading, setClientLoading] = useState(true);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/dashboard');
    } else if (!authLoading) {
      setClientLoading(false);
    }
  }, [isAuthenticated, authLoading, router]);

  const handleLoginSuccess = () => {
    router.push('/dashboard');
  };

  const handleLoginError = (error: string) => {
    console.error('Login error:', error);
  };

  // Show loading spinner while checking authentication
  if (clientLoading || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">{t('auth.welcome_back')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('auth.signin_subtitle')}
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <LoginForm
            onSuccess={handleLoginSuccess}
            onError={handleLoginError}
          />

          {/* Footer Links */}
          <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
            <p>{t('auth.demo_credentials')}</p>
            <p className="pt-2">
              {t('auth.no_account')}{' '}
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                {t('auth.signup_here')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
