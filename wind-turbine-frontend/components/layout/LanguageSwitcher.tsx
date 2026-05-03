'use client';

// Перемикач мов EN ↔ UA для верхньої навігації.
// Виглядає як segmented control з амбер-індикатором активної мови.

import { useLocale, LOCALES, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="flex items-center h-9 px-1 rounded-md surface-1 hairline border"
    >
      {LOCALES.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            aria-pressed={active}
            aria-label={l.label}
            className={cn(
              'mono text-[10px] tracking-widest h-7 px-2.5 rounded transition-colors',
              active
                ? 'ink-1 surface-3'
                : 'ink-3 hover:ink-1'
            )}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
