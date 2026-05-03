'use client';

import { TopBar } from '@/components/layout/TopBar';
import { useAuthStore } from '@/store/auth';
import { ReactNode, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, setToken, fetchCurrentUser } = useAuthStore();

  // Hydrate auth store when the user lands via cookie (bypasses login form)
  useEffect(() => {
    if (user) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) return;
    setToken(token);
    fetchCurrentUser().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-x-hidden scroll-quiet relative z-10">{children}</main>
    </div>
  );
}
