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

/**
 * Re-hydrates auth from the httpOnly cookie when the client has no token.
 *
 * When a returning user has a valid auth_token cookie but localStorage was
 * cleared (different browser session, cleared storage, etc.), client API
 * calls would otherwise fail with 401/403 because getApiWithAuth reads from
 * localStorage. This hydrator hits the Next.js /api/auth/me proxy (which
 * reads the cookie server-side), and on success seeds localStorage + Zustand.
 */
function AuthHydrator() {
  const { user, isLoading, setToken, setUser } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (user || isLoading || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.access_token && typeof window !== 'undefined') {
          localStorage.setItem('auth_token', data.access_token);
          setToken(data.access_token);
        }
        if (data?.id) {
          setUser({
            id: data.id,
            email: data.email,
            name: data.name,
            role: data.role,
            created_at: data.created_at,
          });
        }
      } catch {
        // No valid session — nothing to hydrate
      }
    })();
  }, [user, isLoading, setToken, setUser]);

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
