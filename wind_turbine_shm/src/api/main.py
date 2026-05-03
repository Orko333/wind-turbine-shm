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
import random
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
)
from .schemas import HealthCheckResponse
from ..database.config import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Завантажити ML-моделі та ініціалізувати БД під час запуску."""
    logger.info("Ініціалізація бази даних...")
    try:
        init_db()
        logger.info("База даних готова.")
    except Exception as e:
        logger.warning(f"БД недоступна, продовжуємо без неї: {e}")

    logger.info("Завантаження ML-моделей...")
    try:
        load_models("models/checkpoints")
        logger.info("Моделі завантажено — API готовий.")
    except Exception as e:
        logger.warning(f"Помилка завантаження моделей: {e}")
    yield
    logger.info("Завершення роботи.")


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
    Generic dashboard WebSocket — keeps the connection alive and pushes mock
    turbine telemetry for any channels the client subscribes to.

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
                payload = {
                    "type": "update",
                    "channel": channel,
                    "data": {
                        "turbine_id": turbine_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "power_kw": round(random.uniform(800, 2400), 1),
                        "wind_speed": round(random.uniform(3, 18), 2),
                        "rotor_rpm": round(random.uniform(8, 14), 2),
                        "pitch_angle": round(random.uniform(-2, 25), 2),
                        "tower_moment_knm": round(random.uniform(5000, 15000), 1),
                        "blade_load_kn": round(random.uniform(20, 80), 1),
                        "vibration_mms": round(random.uniform(0.5, 7), 2),
                        "temperature_c": round(random.uniform(20, 70), 1),
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
