'use client';

// Контекст локалізації: зберігає поточну мову та надає функцію t() для перекладів.
// Стан персистенто зберігається в localStorage під ключем 'helios.locale'.

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { translations, type Locale } from './translations';

const STORAGE_KEY = 'helios.locale';
const DEFAULT_LOCALE: Locale = 'uk';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? `{{${key}}}`));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Початкове значення — DEFAULT (для SSR). На клієнті після монтування читаємо localStorage.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved === 'en' || saved === 'uk') setLocaleState(saved);
    } catch {
      // localStorage недоступний — лишаємо дефолт
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      // Оновлюємо атрибут lang на html — корисно для шрифтів та accessibility
      document.documentElement.lang = next;
    } catch {
      // Ігноруємо помилки запису
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const dict = translations[locale] as Record<string, string>;
      const enDict = translations.en as Record<string, string>;
      const value = dict[key] ?? enDict[key] ?? key;
      return interpolate(value, params);
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Безпечний резервний варіант для випадків, коли провайдер відсутній.
    // Повертаємо дефолтну реалізацію, що віддає англійські рядки.
    return {
      locale: 'en' as Locale,
      setLocale: () => {},
      t: (key: string, params?: Record<string, string | number>) => {
        const dict = translations.en as Record<string, string>;
        return interpolate(dict[key] ?? key, params);
      },
    };
  }
  return ctx;
}

// Зручний короткий хук — повертає лише функцію t().
export function useT() {
  return useLocale().t;
}
