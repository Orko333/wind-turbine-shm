'use client';

import { TopBar } from '@/components/layout/TopBar';
import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-x-hidden scroll-quiet relative z-10">{children}</main>
    </div>
  );
}
