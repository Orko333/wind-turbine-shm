# Frontend Wind Turbine SHM

Це фронтенд-застосунок на Next.js для системи моніторингу структурного стану вітротурбін.

## Технології

- Next.js (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (стан застосунку)
- React Query
- WebSocket для даних у реальному часі
- Вбудована локалізація (English / Українська)

## Швидкий старт

```bash
npm install
npm run dev
```

Застосунок буде доступний за адресою: http://localhost:3000

## Корисні скрипти

```bash
npm run dev           # запуск у режимі розробки
npm run build         # production збірка
npm run start         # запуск production збірки
npm run lint          # перевірка lint-правил
npm run type-check    # перевірка типів TypeScript
npm test              # unit-тести
npm run e2e           # e2e-тести
```

## Змінні середовища

Створіть `.env.local` у корені `wind-turbine-frontend`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
NEXT_PUBLIC_MAPBOX_TOKEN=
```

## Локалізація

У проєкті є двомовний інтерфейс:
- `en` — англійська
- `uk` — українська

Переклади зберігаються у файлі `lib/i18n/translations.ts`, перемикання мови — у верхній панелі інтерфейсу.

## Структура

- `app/` — маршрути Next.js
- `components/` — UI-компоненти
- `hooks/` — кастомні React-хуки
- `lib/` — API-клієнт, i18n, утиліти
- `store/` — глобальний стан (Zustand)
- `types/` — типи домену та API

## Деплой

Рекомендовано деплоїти у складі загального проєкту через `docker-compose` з backend і PostgreSQL.
