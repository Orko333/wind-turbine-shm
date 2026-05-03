"""MQTT-клієнт для інтеграції DAQ — приймає високочастотні сенсорні дані."""

import json
import asyncio
from typing import Callable, Dict, List
from dataclasses import dataclass, asdict
import paho.mqtt.client as mqtt
from loguru import logger
import numpy as np


@dataclass
class SensorReading:
    """Одне сенсорне зчитування з системи DAQ."""
    turbine_id: str
    timestamp: str
    accel_x: float  # [м/с²]
    accel_y: float
    accel_z: float
    strain_mW: float  # [мікроВт]
    temperature_c: float  # [°C]
    wind_speed: float  # [м/с]
    rotor_rpm: float


class MQTTDAQClient:
    """MQTT-клієнт для отримання високочастотних сенсорних даних із систем DAQ."""

    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        client_id: str = "wind-turbine-daq",
        turbine_topics: Dict[str, str] = None,
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)

        # Відповідність топіків: turbine_id -> MQTT topic
        self.turbine_topics = turbine_topics or {
            "WT-001": "windpark/WT-001/sensors",
            "WT-002": "windpark/WT-002/sensors",
            "WT-003": "windpark/WT-003/sensors",
            "WT-004": "windpark/WT-004/sensors",
        }

        # Зворотні виклики (колбеки)
        self.on_reading: Callable[[SensorReading], None] = None
        self.on_alert: Callable[[str, str], None] = None

        # Буфер для високочастотних даних (1 секунда = 100 зразків при 100 Гц)
        self.accel_buffer = {}
        self.buffer_size = 100

        # Налаштовуємо колбеки MQTT
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(self, client, userdata, flags, rc):
        """Колбек підключення MQTT."""
        if rc == 0:
            logger.info(f"MQTT connected to {self.broker_host}:{self.broker_port}")

            # Підписуємося на всі топіки турбін
            for turbine_id, topic in self.turbine_topics.items():
                client.subscribe(topic)
                logger.info(f"Subscribed to {topic}")
        else:
            logger.error(f"MQTT connection failed with code {rc}")

    def _on_message(self, client, userdata, msg):
        """Колбек отримання повідомлення MQTT."""
        try:
            payload = json.loads(msg.payload.decode())

            # Знаходимо turbine_id за топіком
            turbine_id = None
            for tid, topic in self.turbine_topics.items():
                if msg.topic == topic or msg.topic.startswith(topic):
                    turbine_id = tid
                    break

            if not turbine_id:
                logger.warning(f"Unknown topic: {msg.topic}")
                return

            # Створюємо сенсорне зчитування
            reading = SensorReading(
                turbine_id=turbine_id,
                timestamp=payload.get("timestamp"),
                accel_x=float(payload.get("accel_x", 0.0)),
                accel_y=float(payload.get("accel_y", 0.0)),
                accel_z=float(payload.get("accel_z", 0.0)),
                strain_mW=float(payload.get("strain", 0.0)),
                temperature_c=float(payload.get("temp", 25.0)),
                wind_speed=float(payload.get("wind_speed", 0.0)),
                rotor_rpm=float(payload.get("rotor_rpm", 0.0)),
            )

            # Буферизуємо прискорення для аналізу БПФ
            if turbine_id not in self.accel_buffer:
                self.accel_buffer[turbine_id] = []

            accel_mag = np.sqrt(
                reading.accel_x ** 2 + reading.accel_y ** 2 + reading.accel_z ** 2
            )
            self.accel_buffer[turbine_id].append(accel_mag)

            # Коли буфер заповнений, виконуємо обробку
            if len(self.accel_buffer[turbine_id]) >= self.buffer_size:
                self._process_buffer(turbine_id)

            # Викликаємо користувацький колбек
            if self.on_reading:
                self.on_reading(reading)

        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")

    def _process_buffer(self, turbine_id: str):
        """Обробляє буферизовані дані прискорення (БПФ, виявлення аномалій)."""
        signal_data = np.array(self.accel_buffer[turbine_id])
        self.accel_buffer[turbine_id] = []

        # Обчислюємо RMS
        rms = np.sqrt(np.mean(signal_data ** 2))

        # Просте виявлення аномалій: тривога, якщо RMS > поріг
        anomaly_threshold = 1.5  # [м/с²]
        if rms > anomaly_threshold:
            alert_msg = f"High vibration detected: RMS={rms:.2f} m/s²"
            if self.on_alert:
                self.on_alert(turbine_id, alert_msg)
            logger.warning(f"[{turbine_id}] {alert_msg}")

    def _on_disconnect(self, client, userdata, rc):
        """Колбек відключення MQTT."""
        if rc != 0:
            logger.warning(f"MQTT disconnected with code {rc}")
        else:
            logger.info("MQTT disconnected cleanly")

    def connect(self):
        """Підключається до MQTT-брокера."""
        try:
            self.client.connect(self.broker_host, self.broker_port, keepalive=60)
            self.client.loop_start()
            logger.info("MQTT client started")
        except Exception as e:
            logger.error(f"Failed to connect MQTT: {e}")
            raise

    def disconnect(self):
        """Відключається від MQTT-брокера."""
        self.client.loop_stop()
        self.client.disconnect()
        logger.info("MQTT client stopped")

    def publish_prediction(self, turbine_id: str, prediction: Dict):
        """Публікує результати прогнозу назад у брокер."""
        topic = f"windpark/{turbine_id}/predictions"
        payload = json.dumps(prediction)
        self.client.publish(topic, payload)

    def is_connected(self) -> bool:
        """Перевіряє, чи підключено MQTT-клієнта."""
        return self.client.is_connected()
