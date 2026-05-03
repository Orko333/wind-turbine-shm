"""SCADA-клієнт — підключення до реальних систем турбін через Modbus, OPC UA, HTTP."""

from __future__ import annotations

from typing import Dict, List, Optional, Callable
from dataclasses import dataclass
from enum import Enum
import asyncio
from loguru import logger
from datetime import datetime, timezone
import json


class SCADAProtocol(str, Enum):
    """Підтримувані протоколи SCADA."""
    MODBUS_TCP = "modbus_tcp"
    MODBUS_RTU = "modbus_rtu"
    OPC_UA = "opc_ua"
    HTTP_API = "http_api"
    DNV_GL = "dnv_gl"


@dataclass
class SCADAReading:
    """Одне вимірювання SCADA від турбіни."""
    turbine_id: str
    timestamp: str
    wind_speed: float  # [м/с]
    rotor_speed: float  # [об/хв]
    pitch_angle: float  # [градуси]
    power_output: float  # [кВт]
    tower_base_moment: float  # [кНм]
    tower_top_acceleration: float  # [м/с²]
    temperature: float  # [°C]
    strain_gauge: float  # [мікродеформація]


class ModbusTCPClient:
    """Клієнт Modbus TCP для застарілих систем турбін."""

    def __init__(self, host: str, port: int = 502, slave_id: int = 1):
        self.host = host
        self.port = port
        self.slave_id = slave_id
        self.connected = False
        self.last_reading: Optional[SCADAReading] = None

        try:
            from pymodbus.client import ModbusTcpClient
            self.client = ModbusTcpClient(host=host, port=port)
        except ImportError:
            logger.warning("pymodbus not installed. Modbus TCP will be unavailable.")
            self.client = None

    async def connect(self):
        """Підключається до Modbus-сервера."""
        if self.client is None:
            raise RuntimeError("pymodbus not installed")

        try:
            self.connected = await asyncio.to_thread(self.client.connect)
            logger.info(f"Modbus TCP connected to {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Modbus connection failed: {e}")
            raise

    async def read_turbine_data(self, turbine_id: str) -> Optional[SCADAReading]:
        """Зчитує дані турбіни з регістрів Modbus."""
        if not self.connected or self.client is None:
            return None

        try:
            # Зчитуємо з holding-регістрів
            # Типова відповідність: wind_speed за адресою 0, rotor_speed за 1, тощо.
            result = await asyncio.to_thread(
                self.client.read_holding_registers,
                address=0,
                count=10,
                slave=self.slave_id,
            )

            if result.isError():
                logger.error(f"Modbus read error: {result}")
                return None

            registers = result.registers

            reading = SCADAReading(
                turbine_id=turbine_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                wind_speed=float(registers[0]) / 100,  # Масштабовано
                rotor_speed=float(registers[1]) / 10,
                pitch_angle=float(registers[2]) / 100,
                power_output=float(registers[3]),
                tower_base_moment=float(registers[4]) / 10,
                tower_top_acceleration=float(registers[5]) / 1000,
                temperature=float(registers[6]) / 10,
                strain_gauge=float(registers[7]),
            )

            self.last_reading = reading
            logger.debug(f"Modbus reading: {turbine_id} wind={reading.wind_speed:.1f}m/s")
            return reading

        except Exception as e:
            logger.error(f"Modbus read exception: {e}")
            return None

    async def disconnect(self):
        """Відключається від Modbus-сервера."""
        if self.client:
            await asyncio.to_thread(self.client.close)
            self.connected = False
            logger.info("Modbus disconnected")


class OPCUAClient:
    """Клієнт OPC UA для сучасних промислових систем."""

    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self.connected = False
        self.last_reading: Optional[SCADAReading] = None

        try:
            from asyncua import Client
            self.client = Client(url=endpoint)
        except ImportError:
            logger.warning("asyncua not installed. OPC UA will be unavailable.")
            self.client = None

    async def connect(self):
        """Підключається до OPC UA-сервера."""
        if self.client is None:
            raise RuntimeError("asyncua not installed")

        try:
            await self.client.connect()
            self.connected = True
            logger.info(f"OPC UA connected to {self.endpoint}")
        except Exception as e:
            logger.error(f"OPC UA connection failed: {e}")
            raise

    async def read_turbine_data(self, turbine_id: str, node_ids: Dict[str, str]) -> Optional[SCADAReading]:
        """
        Зчитує дані турбіни з вузлів OPC UA.

        Args:
            turbine_id: Ідентифікатор турбіни
            node_ids: Словник, що зіставляє назви параметрів з ID вузлів OPC UA
        """
        if not self.connected or self.client is None:
            return None

        try:
            values = {}
            for param, node_id in node_ids.items():
                try:
                    node = self.client.get_node(node_id)
                    values[param] = await node.read_value()
                except Exception as e:
                    logger.warning(f"Failed to read {param} from {node_id}: {e}")
                    values[param] = 0.0

            reading = SCADAReading(
                turbine_id=turbine_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                wind_speed=float(values.get("wind_speed", 0.0)),
                rotor_speed=float(values.get("rotor_speed", 0.0)),
                pitch_angle=float(values.get("pitch_angle", 0.0)),
                power_output=float(values.get("power_output", 0.0)),
                tower_base_moment=float(values.get("moment", 0.0)),
                tower_top_acceleration=float(values.get("acceleration", 0.0)),
                temperature=float(values.get("temperature", 25.0)),
                strain_gauge=float(values.get("strain", 0.0)),
            )

            self.last_reading = reading
            logger.debug(f"OPC UA reading: {turbine_id} wind={reading.wind_speed:.1f}m/s")
            return reading

        except Exception as e:
            logger.error(f"OPC UA read exception: {e}")
            return None

    async def disconnect(self):
        """Відключається від OPC UA-сервера."""
        if self.connected:
            await self.client.disconnect()
            self.connected = False
            logger.info("OPC UA disconnected")


class HTTPAPIClient:
    """Клієнт HTTP API для турбін, підключених до хмари."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self.connected = False
        self.last_reading: Optional[SCADAReading] = None

        try:
            import httpx
            self.client = httpx.AsyncClient(
                base_url=base_url,
                headers={"Authorization": f"Bearer {api_key}"} if api_key else {}
            )
        except ImportError:
            logger.warning("httpx not installed. HTTP API client will be unavailable.")
            self.client = None

    async def connect(self):
        """Ініціалізує HTTP-клієнта."""
        if self.client is None:
            raise RuntimeError("httpx not installed")
        self.connected = True
        logger.info(f"HTTP API client initialized for {self.base_url}")

    async def read_turbine_data(self, turbine_id: str, endpoint: str = "/api/scada/current") -> Optional[SCADAReading]:
        """Отримує дані турбіни через HTTP API."""
        if not self.connected or self.client is None:
            return None

        try:
            response = await self.client.get(
                endpoint,
                params={"turbine_id": turbine_id}
            )
            response.raise_for_status()
            data = response.json()

            reading = SCADAReading(
                turbine_id=turbine_id,
                timestamp=data.get("timestamp", datetime.now(timezone.utc).isoformat()),
                wind_speed=float(data.get("wind_speed", 0.0)),
                rotor_speed=float(data.get("rotor_speed", 0.0)),
                pitch_angle=float(data.get("pitch_angle", 0.0)),
                power_output=float(data.get("power_output", 0.0)),
                tower_base_moment=float(data.get("moment", 0.0)),
                tower_top_acceleration=float(data.get("acceleration", 0.0)),
                temperature=float(data.get("temperature", 25.0)),
                strain_gauge=float(data.get("strain", 0.0)),
            )

            self.last_reading = reading
            logger.debug(f"HTTP API reading: {turbine_id} wind={reading.wind_speed:.1f}m/s")
            return reading

        except Exception as e:
            logger.error(f"HTTP API read exception: {e}")
            return None

    async def disconnect(self):
        """Закриває HTTP-клієнта."""
        if self.client:
            await self.client.aclose()
            self.connected = False
            logger.info("HTTP API client closed")


class SCADAIntegration:
    """Уніфікований SCADA-клієнт із підтримкою декількох протоколів."""

    def __init__(self, protocol: SCADAProtocol, **kwargs):
        self.protocol = protocol
        self.client = None
        self.on_reading: Callable[[SCADAReading], None] = None

        if protocol == SCADAProtocol.MODBUS_TCP:
            self.client = ModbusTCPClient(
                host=kwargs.get("host", "localhost"),
                port=kwargs.get("port", 502),
                slave_id=kwargs.get("slave_id", 1),
            )
        elif protocol == SCADAProtocol.OPC_UA:
            self.client = OPCUAClient(endpoint=kwargs.get("endpoint"))
        elif protocol == SCADAProtocol.HTTP_API:
            self.client = HTTPAPIClient(
                base_url=kwargs.get("base_url"),
                api_key=kwargs.get("api_key"),
            )
        else:
            raise ValueError(f"Unsupported protocol: {protocol}")

    async def connect(self):
        """Підключається до SCADA-системи."""
        if self.client:
            await self.client.connect()

    async def read_turbine_data(
        self,
        turbine_id: str,
        **kwargs
    ) -> Optional[SCADAReading]:
        """Зчитує дані турбіни обраним протоколом."""
        if self.client is None:
            return None

        reading = await self.client.read_turbine_data(turbine_id, **kwargs)

        if reading and self.on_reading:
            self.on_reading(reading)

        return reading

    async def disconnect(self):
        """Відключається від SCADA-системи."""
        if self.client:
            await self.client.disconnect()
