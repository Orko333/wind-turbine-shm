'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';

/**
 * In development mode: auto-logs in with demo credentials so дані loads
 * without manual login. Only active when NODE_ENV === 'development'.
 */
export function DevAuthInitializer() {
  if (process.env.NODE_ENV !== 'development') return null;

  return <DevAuthInner />;
}

function DevAuthInner() {
  const { token, login, isLoading } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (token || isLoading || attempted.current) return;
    attempted.current = true;
    login('engineer@example.com', 'Password123!').catch(() => {
      // ignore — user may log in manually
    });
  }, [token, isLoading, login]);

  return null;
}
