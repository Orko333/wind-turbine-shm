'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  nestedItems?: NavItemChild[];
  onClick?: () => void;
  className?: string;
}

export interface NavItemChild {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export function NavItem({ icon, label, href, onClick, className }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
        className
      )}
    >
      <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center opacity-80">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
