# Панель моніторингу Wind Turbine SHM

Комплексна система Structural Health Monitoring (SHM) і Predictive Maintenance для вітрових турбін.
Репозиторій містить фронтенд (Next.js), backend API (FastAPI) і базу даних PostgreSQL.

## Архітектура

- **Frontend**: Next.js 14, TypeScript, Tailwind, Zustand, React Query
- **Backend**: FastAPI, JWT + RBAC, REST + WebSocket, ML-моделі прогнозування
- **Database**: PostgreSQL 16

## Швидкий старт (Docker Compose)

```bash
docker compose up -d

docker compose ps
docker compose logs -f

docker compose down
```

Після запуску:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- PostgreSQL: localhost:5432

## Локальна розробка

### Frontend

```bash
cd wind-turbine-frontend
npm install
npm run dev
npm test
npm run e2e
```

### Backend

```bash
cd wind_turbine_shm
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn src.api.main:app --reload
```

## Основні можливості

- Моніторинг парку турбін у реальному часі
- Алерти й показники стану обладнання
- Аналіз втомного пошкодження та RUL
- ML/аналітика для раннього виявлення ризиків
- WebSocket-потік даних з оперативним оновленням UI

## Локалізація

У фронтенді підтримуються дві мови:
- `uk` — українська
- `en` — англійська

Переклади зберігаються у `wind-turbine-frontend/lib/i18n/translations.ts`.

## Тести

```bash
# backend
cd wind_turbine_shm
pytest

# frontend
cd wind-turbine-frontend
npm test
npm run e2e
```

## Оточення

### Приклад змінних для frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
```

### Приклад змінних для backend/compose

```env
POSTGRES_DB=wind_turbine_shm
POSTGRES_USER=wind_user
POSTGRES_PASSWORD=wind_turbine_pass
SECRET_KEY=your-secret-key-min-32-characters
```

## Структура репозиторію

- `wind_turbine_shm/` — backend API, ML, обробка даних
- `wind-turbine-frontend/` — веб-інтерфейс та клієнтська логіка
- `docker-compose.yml` — локальний оркестратор сервісів
