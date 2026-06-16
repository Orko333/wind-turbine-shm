"""Роутер інтеграції SCADA — підключення до реальних систем турбін."""

from datetime import datetime, timedelta, timezone
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, Optional, List
from loguru import logger

from ...database.config import get_db, SessionLocal
from ...database.models import User, Turbine, ScadaReading as ScadaReadingDB
from ..dependencies import get_current_user
from ...scada.client import SCADAIntegration, SCADAProtocol, SCADAReading
from ...scada.realtime_simulator import realtime_registry

router = APIRouter(prefix="/scada", tags=["scada"])

# Глобальні SCADA-клієнти для кожної турбіни
scada_clients: Dict[str, SCADAIntegration] = {}


class SCADAConnectionConfig(BaseModel):
    """Конфігурація SCADA-з'єднання."""
    protocol: str = Field(..., description="modbus_tcp, opc_ua, or http_api")
    host: Optional[str] = None
    port: Optional[int] = None
    endpoint: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    slave_id: Optional[int] = 1


class SCADAReading(BaseModel):
    """Відповідь зі зчитаними даними SCADA."""
    turbine_id: str
    timestamp: str
    wind_speed: float
    rotor_speed: float
    pitch_angle: float
    power_output: float
    tower_base_moment: float
    tower_top_acceleration: float
    temperature: float
    strain_gauge: float


class SCADAStatus(BaseModel):
    """Статус SCADA-з'єднання."""
    turbine_id: str
    connected: bool
    protocol: Optional[str]
    last_reading_timestamp: Optional[str]


@router.post("/connect/{turbine_id}")
async def connect_scada(
    turbine_id: str,
    config: SCADAConnectionConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Підключається до SCADA-системи турбіни."""
    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Відключаємо наявного клієнта, якщо такий є
        if turbine_id in scada_clients:
            await scada_clients[turbine_id].disconnect()

        # Створюємо нового клієнта
        protocol = SCADAProtocol(config.protocol)

        client_kwargs = {}
        if protocol == SCADAProtocol.MODBUS_TCP:
            client_kwargs = {
                "host": config.host or "localhost",
                "port": config.port or 502,
                "slave_id": config.slave_id or 1,
            }
        elif protocol == SCADAProtocol.OPC_UA:
            if not config.endpoint:
                raise ValueError("endpoint required for OPC UA")
            client_kwargs = {"endpoint": config.endpoint}
        elif protocol == SCADAProtocol.HTTP_API:
            if not config.base_url:
                raise ValueError("base_url required for HTTP API")
            client_kwargs = {
                "base_url": config.base_url,
                "api_key": config.api_key,
            }

        client = SCADAIntegration(protocol=protocol, **client_kwargs)
        await client.connect()
        scada_clients[turbine_id] = client

        logger.info(f"SCADA {protocol.value} connected for {turbine_id}")

        return {
            "status": "connected",
            "turbine_id": turbine_id,
            "protocol": protocol.value,
        }

    except Exception as e:
        logger.error(f"SCADA connection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect/{turbine_id}")
async def disconnect_scada(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Відключає SCADA-систему."""
    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id in scada_clients:
        await scada_clients[turbine_id].disconnect()
        del scada_clients[turbine_id]
        logger.info(f"SCADA disconnected for {turbine_id}")

    return {"status": "disconnected", "turbine_id": turbine_id}


@router.get("/status/{turbine_id}", response_model=SCADAStatus)
async def get_scada_status(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SCADAStatus:
    """Повертає статус SCADA-з'єднання."""
    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in scada_clients:
        return SCADAStatus(
            turbine_id=turbine_id,
            connected=False,
            protocol=None,
            last_reading_timestamp=None,
        )

    client = scada_clients[turbine_id]
    return SCADAStatus(
        turbine_id=turbine_id,
        connected=client.client.connected if client.client else False,
        protocol=client.protocol.value,
        last_reading_timestamp=client.client.last_reading.timestamp if client.client and client.client.last_reading else None,
    )


@router.post("/read/{turbine_id}", response_model=SCADAReading)
async def read_scada_data(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SCADAReading:
    """Зчитує поточні дані з SCADA-системи."""
    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in scada_clients:
        raise HTTPException(status_code=503, detail="SCADA not connected")

    try:
        client = scada_clients[turbine_id]
        reading = await client.read_turbine_data(turbine_id)

        if not reading:
            raise HTTPException(status_code=502, detail="Failed to read SCADA data")

        return SCADAReading(
            turbine_id=reading.turbine_id,
            timestamp=reading.timestamp,
            wind_speed=reading.wind_speed,
            rotor_speed=reading.rotor_speed,
            pitch_angle=reading.pitch_angle,
            power_output=reading.power_output,
            tower_base_moment=reading.tower_base_moment,
            tower_top_acceleration=reading.tower_top_acceleration,
            temperature=reading.temperature,
            strain_gauge=reading.strain_gauge,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SCADA read error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/poll/{turbine_id}/start")
async def start_polling(
    turbine_id: str,
    interval_seconds: int = 60,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Запускає безперервне опитування даних SCADA."""
    # Перевіряємо, що турбіна належить користувачу
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in scada_clients:
        raise HTTPException(status_code=503, detail="SCADA not connected")

    logger.info(f"Started polling {turbine_id} every {interval_seconds}s")

    return {
        "status": "polling_started",
        "turbine_id": turbine_id,
        "interval_seconds": interval_seconds,
    }


class ScadaHistorySample(BaseModel):
    timestamp: str
    wind_speed: float
    rotor_rpm: float
    pitch_angle: float
    power_kw: float
    tower_moment_knm: float
    tower_top_accel_rms: Optional[float] = None
    blade_load_kn: Optional[float] = None
    vibration_mms: Optional[float] = None
    nacelle_temp_degC: Optional[float] = None
    cumulative_damage: Optional[float] = None


class ScadaHistoryResponse(BaseModel):
    turbine_id: str
    count: int
    samples: List[ScadaHistorySample]


@router.get("/history/{turbine_id}", response_model=ScadaHistoryResponse)
async def get_scada_history(
    turbine_id: str,
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(2000, ge=1, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScadaHistoryResponse:
    """Повертає збережені SCADA-зразки турбіни за останні N годин."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()
    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (
        db.query(ScadaReadingDB)
        .filter(ScadaReadingDB.turbine_id == turbine_id, ScadaReadingDB.timestamp >= since)
        .order_by(ScadaReadingDB.timestamp.asc())
        .limit(limit)
        .all()
    )

    samples = [
        ScadaHistorySample(
            timestamp=r.timestamp.isoformat(),
            wind_speed=r.wind_speed,
            rotor_rpm=r.rotor_rpm,
            pitch_angle=r.pitch_angle,
            power_kw=r.power_kw,
            tower_moment_knm=r.tower_moment_knm,
            tower_top_accel_rms=r.tower_top_accel_rms,
            blade_load_kn=r.blade_load_kn,
            vibration_mms=r.vibration_mms,
            nacelle_temp_degC=r.nacelle_temp_degC,
            cumulative_damage=r.cumulative_damage,
        )
        for r in rows
    ]
    return ScadaHistoryResponse(turbine_id=turbine_id, count=len(samples), samples=samples)


@router.get("/export/{turbine_id}.csv")
async def export_scada_csv(
    turbine_id: str,
    hours: int = Query(24, ge=1, le=720),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """CSV експорт збережених SCADA-зразків за останні N годин."""
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()
    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    cols = [
        "timestamp", "wind_speed", "rotor_rpm", "pitch_angle", "power_kw",
        "tower_moment_knm", "tower_top_accel_rms", "blade_load_kn",
        "vibration_mms", "nacelle_temp_degC", "cumulative_damage",
    ]

    def row_iter():
        # Потокова віддача CSV рядок-за-рядком. Власна сесія, бо генератор
        # виконується ПІСЛЯ повернення з ендпоінта (Depends-сесію вже закрито).
        # yield_per не матеріалізує всі рядки в пам'яті — витримує великі
        # експорти (раніше .all() + StringIO падали/таймаутили на «багато даних»).
        sess = SessionLocal()
        try:
            yield ",".join(cols) + "\n"
            q = (
                sess.query(ScadaReadingDB)
                .filter(ScadaReadingDB.turbine_id == turbine_id, ScadaReadingDB.timestamp >= since)
                .order_by(ScadaReadingDB.timestamp.asc())
                .yield_per(1000)
            )
            for r in q:
                yield ",".join(str(v) if v is not None else "" for v in [
                    r.timestamp.isoformat(),
                    r.wind_speed, r.rotor_rpm, r.pitch_angle, r.power_kw,
                    r.tower_moment_knm, r.tower_top_accel_rms, r.blade_load_kn,
                    r.vibration_mms, r.nacelle_temp_degC, r.cumulative_damage,
                ]) + "\n"
        finally:
            sess.close()

    filename = f"turbine-{turbine_id}-{hours}h-{datetime.now(timezone.utc).date()}.csv"
    return StreamingResponse(
        row_iter(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
