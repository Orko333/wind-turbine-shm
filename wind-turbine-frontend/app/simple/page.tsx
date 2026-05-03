'use client';

import { useLocale } from '../../lib/i18n';

export default function SimplePage() {
  const { locale } = useLocale();
  return <h1>{locale === 'uk' ? 'Проста тестова сторінка' : 'Simple Test Page'}</h1>;
}
