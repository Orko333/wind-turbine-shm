'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignupForm } from '@/components/forms/SignupForm';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function SignupPage() {
  const t = useT();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [clientLoading, setClientLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/dashboard');
    } else if (!authLoading) {
      setClientLoading(false);
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSuccess = () => {
    router.push('/dashboard');
  };

  const handleError = (error: string) => {
    console.error('Signup error:', error);
  };

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
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">{t('auth.create_account')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.signup_subtitle')}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <SignupForm onSuccess={handleSuccess} onError={handleError} />

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>
              {t('auth.already_account')}{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                {t('auth.signin_here')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
