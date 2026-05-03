'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface BreadcrumbItem {
  label: string;
  href: string;
  isActive: boolean;
}

/**
 * Компонент хлібних крихт
 * Можливості:
 * - Показує поточне місцезнаходження в ієрархії навігації
 * - Клікабельні посилання для навігації назад
 * - Динамічна генерація хлібних крихт з pathname
 * - Адаптивне відображення
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  // Генерація елементів хлібних крихт з pathname
  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (!pathname) return [];

    // Розділення pathname та відфільтрування порожніх сегментів
    const segments = pathname.split('/').filter((segment) => segment);

    // Завжди починаємо з Dashboard як головної сторінки
    const items: BreadcrumbItem[] = [
      {
        label: t('nav.dashboard'),
        href: '/dashboard',
        isActive: pathname === '/' || pathname === '/dashboard',
      },
    ];

    // Побудова ланцюжка хлібних крихт
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;

      // Пропустити dashboard, якщо це перший сегмент
      if (segment === 'dashboard') return;

      const navKey = `nav.${segment}` as Parameters<typeof t>[0];
      const autoLabel = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      const label = t(navKey) !== navKey ? t(navKey) : autoLabel;

      const isActive = index === segments.length - 1;

      items.push({
        label,
        href: currentPath,
        isActive,
      });
    });

    return items;
  }, [pathname]);

  // Обробка навігації
  const handleNavigate = (href: string) => {
    router.push(href);
  };

  // На мобільних показуємо лише 2 останні хлібні крихти
  const displayBreadcrumbs =
    breadcrumbs.length > 3
      ? breadcrumbs.slice(-2)
      : breadcrumbs;

  // Завжди показуємо принаймні Dashboard
  const visibleBreadcrumbs = displayBreadcrumbs.length > 0
    ? displayBreadcrumbs
    : breadcrumbs;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-x-auto">
      {visibleBreadcrumbs.map((item, index) => (
        <div key={item.href} className="flex items-center gap-1 flex-shrink-0">
          {/* Розділювач */}
          {index > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          {/* Елемент хлібних крихт */}
          {item.isActive ? (
            <span className={cn('text-sm font-medium text-foreground px-2 py-1')}>
              {item.label}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate(item.href)}
              className="h-7 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Button>
          )}
        </div>
      ))}

      {/* Показати три крапки, якщо хлібні крихти обрізані */}
      {breadcrumbs.length > 3 && displayBreadcrumbs[0] !== breadcrumbs[0] && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground px-2">...</span>
        </div>
      )}
    </nav>
  );
}
