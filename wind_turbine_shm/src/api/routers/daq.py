"""DAQ management — configure and monitor data acquisition from sensors."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Dict
from loguru import logger

from ...database.config import get_db
from ...database.models import User
from ..dependencies import get_current_user
from ...daq.mqtt_client import MQTTDAQClient

router = APIRouter(prefix="/daq", tags=["daq"])

# Global MQTT client екземпляр
mqtt_client: MQTTDAQClient = None


class MQTTConfig(BaseModel):
    """MQTT broker configuration."""
    broker_host: str = "localhost"
    broker_port: int = 1883
    turbine_topics: Dict[str, str] = None


class DAQStatus(BaseModel):
    """Current DAQ status."""
    is_connected: bool
    broker_host: str
    broker_port: int
    subscribed_turbines: int


@router.post("/mqtt/connect")
async def connect_mqtt(
    config: MQTTConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connect to MQTT broker for DAQ data."""
    global mqtt_client

    try:
        if mqtt_client and mqtt_client.is_connected():
            await disconnect_mqtt(current_user, db)

        mqtt_client = MQTTDAQClient(
            broker_host=config.broker_host,
            broker_port=config.broker_port,
            turbine_topics=config.turbine_topics,
        )

        # Setup callbacks
        def on_reading(reading):
            logger.info(f"DAQ: {reading.turbine_id} - accel: {reading.accel_x:.2f} m/s²")

        def on_alert(turbine_id: str, message: str):
            logger.warning(f"[{turbine_id}] {message}")

        mqtt_client.on_reading = on_reading
        mqtt_client.on_alert = on_alert

        mqtt_client.connect()

        logger.info(f"MQTT connected: {config.broker_host}:{config.broker_port}")

        return {
            "status": "connected",
            "broker": config.broker_host,
            "port": config.broker_port,
        }

    except Exception as e:
        logger.error(f"MQTT connection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mqtt/disconnect")
async def disconnect_mqtt(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect MQTT client."""
    global mqtt_client

    if mqtt_client:
        mqtt_client.disconnect()
        mqtt_client = None
        logger.info("MQTT disconnected")

    return {"status": "disconnected"}


@router.get("/status", response_model=DAQStatus)
async def get_daq_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DAQStatus:
    """Get current DAQ status."""
    global mqtt_client

    if not mqtt_client:
        return DAQStatus(
            is_connected=False, broker_host="N/A", broker_port=0, subscribed_turbines=0
        )

    return DAQStatus(
        is_connected=mqtt_client.is_connected(),
        broker_host=mqtt_client.broker_host,
        broker_port=mqtt_client.broker_port,
        subscribed_turbines=len(mqtt_client.turbine_topics),
    )


@router.post("/simulate-sensor-data")
async def simulate_sensor_data(
    turbine_id: str = "WT-001",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Simulate high-frequency sensor data for testing.
    In production, this would come from real DAQ hardware via MQTT.
    """
    import random
    from datetime import datetime, timezone
    from ...daq.mqtt_client import SensorReading

    reading = SensorReading(
        turbine_id=turbine_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        accel_x=random.gauss(0.0, 0.3),  # m/s²
        accel_y=random.gauss(0.0, 0.3),
        accel_z=random.gauss(0.0, 0.3),
        strain_mW=random.uniform(0.5, 2.0),
        temperature_c=25 + random.gauss(0, 2),
        wind_speed=8.0 + random.gauss(0, 1.5),
        rotor_rpm=12.0 + random.gauss(0, 0.5),
    )

    logger.info(f"Simulated reading for {turbine_id}: {reading}")

    return {
        "status": "ok",
        "turbine_id": turbine_id,
        "timestamp": reading.timestamp,
        "accel_rms": (reading.accel_x ** 2 + reading.accel_y ** 2 + reading.accel_z ** 2) ** 0.5,
    }
