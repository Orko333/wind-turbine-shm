'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

const signupSchema = z.object({
  username: z.string().min(1, 'Username is required').min(3, 'Username must be at least 3 characters'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Password is required'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

interface SignupFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function SignupForm({ onSuccess, onError }: SignupFormProps) {
  const t = useT();
  const { setToken, fetchCurrentUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onSubmit',
    defaultValues: { username: '', email: '', password: '', confirmPassword: '' },
  });

  const translateMsg = (msg?: string): string | undefined => {
    if (!msg) return undefined;
    if (msg === 'Username is required') return t('auth.username_required');
    if (msg === 'Username must be at least 3 characters') return t('auth.username_min');
    if (msg === 'Email is required') return t('auth.email_required');
    if (msg === 'Please enter a valid email address') return t('auth.email_invalid');
    if (msg === 'Password is required') return t('auth.password_required');
    if (msg === 'Password must be at least 8 characters') return t('auth.password_min');
    if (msg === 'Passwords do not match') return t('auth.passwords_mismatch');
    return msg;
  };

  const onSubmit = async (data: SignupFormData): Promise<void> => {
    setIsLoading(true);
    setServerError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.username, email: data.email, password: data.password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || errorData.message || t('auth.register_error');
        setServerError(msg);
        onError?.(msg);
        return;
      }

      const responseData = await response.json().catch(() => ({}));

      if (responseData.access_token) {
        localStorage.setItem('auth_token', responseData.access_token);
        setToken(responseData.access_token);
        try { await fetchCurrentUser(); } catch { /* non-fatal */ }
      }

      onSuccess?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('auth.register_error');
      setServerError(msg);
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="size-5 flex-shrink-0" />
          <span className="text-sm">{serverError}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-sm font-medium">{t('auth.username')}</Label>
        <Input id="username" type="text" placeholder="johndoe" {...register('username')} disabled={isLoading} aria-invalid={!!errors.username} />
        {errors.username && <p className="text-xs text-destructive">{translateMsg(errors.username.message)}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">{t('auth.email')}</Label>
        <Input id="email" type="email" placeholder="you@example.com" {...register('email')} disabled={isLoading} aria-invalid={!!errors.email} />
        {errors.email && <p className="text-xs text-destructive">{translateMsg(errors.email.message)}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium">{t('auth.password')}</Label>
        <Input id="password" type="password" placeholder="••••••••" {...register('password')} disabled={isLoading} aria-invalid={!!errors.password} />
        {errors.password && <p className="text-xs text-destructive">{translateMsg(errors.password.message)}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('auth.confirm_password')}</Label>
        <Input id="confirmPassword" type="password" placeholder="••••••••" {...register('confirmPassword')} disabled={isLoading} aria-invalid={!!errors.confirmPassword} />
        {errors.confirmPassword && <p className="text-xs text-destructive">{translateMsg(errors.confirmPassword.message)}</p>}
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
        {isLoading ? t('auth.signing_up') : t('auth.sign_up')}
      </Button>
    </form>
  );
}
