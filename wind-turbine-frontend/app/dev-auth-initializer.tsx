'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';

export function DevAuthInitializer() {
  return (
    <>
      <AuthHydrator />
      {process.env.NODE_ENV === 'development' && <DevAutoLogin />}
    </>
  );
}

/** Re-fetches user from /auth/me if a persisted token exists but user is null. */
function AuthHydrator() {
  const { token, user, isLoading, fetchCurrentUser } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || user || isLoading || attempted.current) return;
    attempted.current = true;
    fetchCurrentUser().catch(() => {
      // token invalid — store already cleared by fetchCurrentUser on failure
    });
  }, [token, user, isLoading, fetchCurrentUser]);

  return null;
}

/** Dev only: auto-login with demo credentials when no token present. */
function DevAutoLogin() {
  const { token, login, isLoading } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (token || isLoading || attempted.current) return;
    attempted.current = true;
    login('engineer@example.com', 'Password123!').catch(() => {});
  }, [token, isLoading, login]);

  return null;
}
