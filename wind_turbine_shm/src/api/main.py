"""
Система моніторингу структурного стану башти вітрової турбіни — FastAPI-застосунок.

Надає REST API ендпоінти:
  POST /predict/scada        — прогнозування пошкодження за SCADA-даними
  POST /predict/hf-signal   — виявлення аномалій у сигналі вібрації
  POST /predict/batch        — пакетне прогнозування за SCADA
  GET  /turbines/{id}/status — стан здоров'я турбіни
  GET  /turbines/            — список усіх турбін
  GET  /health               — перевірка стану API
  GET  /docs                 — Swagger UI (генерується автоматично)

Запуск:
    uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .model_registry import load_models
from .routers import (
    prediction,
    turbine,
    simulation,
    auth,
    analytics,
    realtime,
    daq,
    oma_monitor,
    advanced_analytics,
    scada,
    blade_monitoring,
    geodetic_monitoring,
    federated,
    physics,
    cnn_patterns,
    digital_twin,
    simulation_advanced,
    alerts,
    user_storage,
    admin_panel,
    health_snapshot,
    reports,
)
from .schemas import HealthCheckResponse
from ..database.config import init_db, get_db, SessionLocal
from ..database.models import User, ScadaReading
from ..auth.security import hash_password
from ..scada.realtime_simulator import realtime_registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Завантажити ML-моделі та ініціалізувати БД під час запуску."""
    logger.info("Ініціалізація бази даних...")
    try:
        init_db()
        logger.info("База даних готова.")
    except Exception as e:
        logger.warning(f"БД недоступна, продовжуємо без неї: {e}")

    # Auto-seed admin user from environment variables
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    if admin_email and admin_password:
        from ..auth.security import verify_password
        db = next(get_db())
        try:
            existing = db.query(User).filter(User.email == admin_email).first()
            if not existing:
                db.add(User(
                    username=admin_username,
                    email=admin_email,
                    hashed_password=hash_password(admin_password),
                    role="admin",
                ))
                db.commit()
                logger.info(f"Admin user '{admin_username}' auto-created from env.")
            elif not verify_password(admin_password, existing.hashed_password):
                existing.hashed_password = hash_password(admin_password)
                existing.role = "admin"
                db.commit()
                logger.info(f"Admin user '{admin_username}' password updated from env.")
            else:
                logger.info(f"Admin user '{admin_username}' already exists.")

            # Auto-seed demo turbines for the admin at startup so the dashboard
            # has data immediately after any (ephemeral) DB reset — not only
            # after the first authenticated GET /turbines/ call. Idempotent.
            from .routers.turbine import _ensure_demo_turbines
            admin_user = db.query(User).filter(User.email == admin_email).first()
            if admin_user:
                _ensure_demo_turbines(db, admin_user)
                logger.info("Demo turbines ensured for admin at startup.")
        except Exception as e:
            db.rollback()
            logger.warning(f"Could not seed admin user: {e}")
        finally:
            db.close()

    logger.info("Завантаження ML-моделей...")
    try:
        load_models("models/checkpoints")
        logger.info("Моделі завантажено — API готовий.")
    except Exception as e:
        logger.warning(f"Помилка завантаження моделей: {e}")

    persistence_task = asyncio.create_task(_persist_readings_loop())
    try:
        yield
    finally:
        persistence_task.cancel()
        try:
            await persistence_task
        except (asyncio.CancelledError, Exception):
            pass
        logger.info("Завершення роботи.")


async def _persist_readings_loop() -> None:
    """Persist one realtime SCADA sample per active turbine every 10 seconds."""
    while True:
        try:
            await asyncio.sleep(10)
            db = SessionLocal()
            try:
                from ..database.models import Turbine as _Turbine
                turbine_ids = [t.turbine_id for t in db.query(_Turbine.turbine_id).all()]
                for tid in turbine_ids:
                    sample = realtime_registry.tick(tid)
                    db.add(ScadaReading(
                        turbine_id=sample.turbine_id,
                        timestamp=datetime.now(timezone.utc),
                        wind_speed=sample.wind_speed,
                        wind_speed_std=sample.wind_speed_std,
                        rotor_rpm=sample.rotor_rpm,
                        pitch_angle=sample.pitch_angle,
                        power_kw=sample.power_kw,
                        tower_moment_knm=sample.tower_moment_knm,
                        tower_top_accel_rms=sample.tower_top_accel_rms,
                        blade_load_kn=sample.blade_load_kn,
                        vibration_mms=sample.vibration_mms,
                        nacelle_temp_degC=sample.nacelle_temp_degC,
                        cumulative_damage=sample.cumulative_damage,
                    ))
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"SCADA persistence error: {e}")
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Persistence loop error: {e}")


app = FastAPI(
    title="Wind Turbine Tower SHM API",
    description=(
        "Автоматизована система моніторингу структурного стану та прогнозування "
        "залишкового ресурсу (RUL) башти вітрової турбіни. "
        "Реалізує алгоритми Rainflow / Пальмгрена-Майнера, LSTM та XGBoost."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
)

# CORS — дозволити міждоменні запити з дашборду Streamlit
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Підключити роутери
app.include_router(auth.router)
app.include_router(prediction.router)
app.include_router(turbine.router)
app.include_router(analytics.router)
app.include_router(advanced_analytics.router)
app.include_router(realtime.router)
app.include_router(daq.router)
app.include_router(scada.router)
app.include_router(blade_monitoring.router)
app.include_router(geodetic_monitoring.router)
app.include_router(federated.router)
app.include_router(oma_monitor.router)
app.include_router(physics.router)
app.include_router(cnn_patterns.router)
app.include_router(digital_twin.router)
app.include_router(simulation_advanced.router)
app.include_router(simulation.router)
app.include_router(alerts.router)
app.include_router(user_storage.router)
app.include_router(admin_panel.router)
app.include_router(health_snapshot.router)
app.include_router(reports.router)


@app.get("/health", response_model=HealthCheckResponse, tags=["system"])
async def health_check() -> HealthCheckResponse:
    """Перевірка доступності API та стану завантажених моделей."""
    from .model_registry import get_model_registry
    registry = get_model_registry()
    return HealthCheckResponse(
        status="ok",
        version="1.0.0",
        models_loaded=registry.is_ready(),
    )


@app.get("/", tags=["system"])
async def root() -> JSONResponse:
    return JSONResponse(
        {
            "message": "API системи моніторингу стану вітрової турбіни працює.",
            "docs": "/docs",
            "health": "/health",
        }
    )


@app.websocket("/ws")
async def ws_dashboard(websocket: WebSocket) -> None:
    """
    Dashboard WebSocket — pushes physics-based realtime SCADA samples for
    subscribed turbines using the per-turbine simulator state.

    Client → server: {"type": "subscribe", "channel": "turbine:WT-001"}
    Server → client: {"type": "update",   "channel": "turbine:WT-001", "data": {...}}
    """
    await websocket.accept()
    subscriptions: set[str] = set()
    push_task: asyncio.Task | None = None

    async def push_loop() -> None:
        while True:
            await asyncio.sleep(2)
            for channel in list(subscriptions):
                turbine_id = channel.split(":", 1)[1] if ":" in channel else channel
                sample = realtime_registry.tick(turbine_id)
                payload = {
                    "type": "update",
                    "channel": channel,
                    "data": {
                        "turbine_id": sample.turbine_id,
                        "timestamp": sample.timestamp,
                        "power_kw": sample.power_kw,
                        "wind_speed": sample.wind_speed,
                        "rotor_rpm": sample.rotor_rpm,
                        "pitch_angle": sample.pitch_angle,
                        "tower_moment_knm": sample.tower_moment_knm,
                        "blade_load_kn": sample.blade_load_kn,
                        "vibration_mms": sample.vibration_mms,
                        "temperature_c": sample.temperature_c,
                        "cumulative_damage": sample.cumulative_damage,
                    },
                }
                try:
                    await websocket.send_text(json.dumps(payload))
                except Exception:
                    return

    try:
        push_task = asyncio.create_task(push_loop())
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")
            channel = msg.get("channel")
            if mtype == "subscribe" and channel:
                subscriptions.add(channel)
            elif mtype == "unsubscribe" and channel:
                subscriptions.discard(channel)
            elif mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"/ws error: {e}")
    finally:
        if push_task is not None:
            push_task.cancel()


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    logger.error(f"Необроблений виняток: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутрішня помилка сервера. Перевірте журнали сервера для деталей."},
    )
