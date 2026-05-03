'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

// Схема валідації
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean(),
});

type LoginFormData = {
  email: string;
  password: string;
  rememberMe: boolean;
};

interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const t = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const translateZodMessage = (msg?: string): string | undefined => {
    if (!msg) return undefined;
    if (msg === 'Email is required') return t('auth.email_required');
    if (msg === 'Please enter a valid email address') return t('auth.email_invalid');
    if (msg === 'Password is required') return t('auth.password_required');
    if (msg === 'Password must be at least 8 characters') return t('auth.password_min');
    return msg;
  };

  const onSubmit = async (data: LoginFormData): Promise<void> => {
    setIsLoading(true);
    setServerError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          const errorMessage =
            errorData.message || t('auth.invalid_credentials');
          setServerError(errorMessage);
          onError?.(errorMessage);
        } catch {
          setServerError(t('auth.server_error'));
          onError?.(t('auth.server_error'));
        }
        return;
      }

      let responseData: { access_token?: string } = {};
      try {
        responseData = await response.json();
      } catch {
        setServerError(t('auth.invalid_response'));
        onError?.(t('auth.invalid_response'));
        return;
      }

      // Store token in localStorage so getApiWithAuth can attach it to requests
      if (responseData.access_token) {
        localStorage.setItem('auth_token', responseData.access_token);
      }

      // Зберегти токен, якщо встановлено "запам'ятати мене"
      if (data.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }

      // Виклик коллбека успіху
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred';
      setServerError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Помилка сервера */}
      {serverError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="size-5 flex-shrink-0" />
          <span className="text-sm">{serverError}</span>
        </div>
      )}

      {/* Поле email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">
          {t('auth.email')}
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          disabled={isLoading}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{translateZodMessage(errors.email.message)}</p>
        )}
      </div>

      {/* Поле пароля */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium">
          {t('auth.password')}
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          disabled={isLoading}
          aria-invalid={!!errors.password}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{translateZodMessage(errors.password.message)}</p>
        )}
      </div>

      {/* Чекбокс "запам'ятати мене" */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="rememberMe"
          {...register('rememberMe')}
          disabled={isLoading}
        />
        <Label
          htmlFor="rememberMe"
          className="text-sm font-normal cursor-pointer"
        >
          {t('auth.remember_me')}
        </Label>
      </div>

      {/* Кнопка надсилання */}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full"
      >
        {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
        {isLoading ? t('auth.signing_in') : t('auth.sign_in')}
      </Button>
    </form>
  );
}
