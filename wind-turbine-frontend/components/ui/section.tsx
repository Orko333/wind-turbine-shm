import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface SectionProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
  bare?: boolean;
}

/**
 * Editorial section header used across charts and panels.
 * `bare` skips the surface wrapper — useful when nested inside a styled grid.
 */
export function Section({ eyebrow, title, description, trailing, children, className, bare = false }: SectionProps) {
  return (
    <section className={cn(!bare && 'surface-1 hairline border rounded-lg', className)}>
      {(eyebrow || title || trailing) && (
        <header className={cn(
          'flex items-end justify-between gap-4 pb-4 hairline-b mb-5',
          !bare && 'px-6 pt-6'
        )}>
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h3 className="display text-2xl ink-1 mt-1">{title}</h3>}
            {description && <p className="text-xs ink-3 mt-1.5 max-w-md leading-relaxed">{description}</p>}
          </div>
          {trailing && <div className="flex items-center gap-2">{trailing}</div>}
        </header>
      )}
      <div className={cn(!bare && 'px-6 pb-6')}>{children}</div>
    </section>
  );
}

interface StatCellProps {
  label: string;
  value: string | number;
  unit?: string;
  className?: string;
}

export function StatCell({ label, value, unit, className }: StatCellProps) {
  return (
    <div className={cn('p-4 surface-2 hairline border rounded-md', className)}>
      <p className="eyebrow">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="display text-2xl ink-1 tabular">{value}</span>
        {unit && <span className="text-xs ink-3">{unit}</span>}
      </div>
    </div>
  );
}
