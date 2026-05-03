"""WebSocket-моніторинг у реальному часі — потокова передача даних турбіни."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import json
from typing import Dict, Set
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user

router = APIRouter(prefix="/realtime", tags=["realtime"])


class ConnectionManager:
    """Керує WebSocket-підключеннями для кожної турбіни."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, turbine_id: str, websocket: WebSocket):
        await websocket.accept()
        if turbine_id not in self.active_connections:
            self.active_connections[turbine_id] = set()
        self.active_connections[turbine_id].add(websocket)

    def disconnect(self, turbine_id: str, websocket: WebSocket):
        self.active_connections[turbine_id].discard(websocket)
        if not self.active_connections[turbine_id]:
            del self.active_connections[turbine_id]

    async def broadcast(self, turbine_id: str, message: dict):
        """Надсилає повідомлення всім клієнтам, що моніторять цю турбіну."""
        if turbine_id in self.active_connections:
            for connection in list(self.active_connections[turbine_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(f"Error sending WebSocket message: {e}")

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Надсилає повідомлення конкретному клієнту."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Error sending personal message: {e}")


manager = ConnectionManager()


@router.websocket("/monitor/{turbine_id}")
async def websocket_monitor(
    websocket: WebSocket,
    turbine_id: str,
    db: Session = Depends(get_db),
):
    """
    WebSocket-ендпоінт для моніторингу турбіни в реальному часі.

    Очікуване повідомлення від клієнта:
    {
        "action": "subscribe" | "data",
        "token": "jwt_token",
        "data": {...}  // для дії data
    }

    Сервер надсилає:
    {
        "type": "status" | "prediction" | "alert" | "heartbeat",
        "timestamp": "2024-01-15T10:30:00",
        "turbine_id": "WT-001",
        "data": {...}
    }
    """
    try:
        # Отримуємо початкове повідомлення автентифікації
        init_msg = await websocket.receive_json()
        token = init_msg.get("token")

        if not token:
            await websocket.send_json({"error": "Token required"})
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Перевіряємо токен (спрощено)
        from ...auth.security import verify_token
        token_data = verify_token(token)
        if not token_data:
            await websocket.send_json({"error": "Invalid token"})
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Перевіряємо, що турбіна належить користувачу
        user = db.query(User).filter(User.username == token_data.username).first()
        turbine = db.query(Turbine).filter(
            (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == user.id)
        ).first()

        if not turbine:
            await websocket.send_json({"error": "Turbine not found"})
            await websocket.close(code=4003, reason="Forbidden")
            return

        await manager.connect(turbine_id, websocket)
        logger.info(f"Client connected to {turbine_id}")

        # Надсилаємо привітальне повідомлення
        await manager.send_personal(
            websocket,
            {
                "type": "connected",
                "turbine_id": turbine_id,
                "message": f"Connected to {turbine.name}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Утримуємо підключення та обробляємо вхідні повідомлення
        try:
            while True:
                msg = await websocket.receive_json()
                action = msg.get("action")

                if action == "ping":
                    await manager.send_personal(
                        websocket,
                        {
                            "type": "pong",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                    )

                elif action == "get_status":
                    # Надсилаємо поточний стан турбіни
                    await manager.send_personal(
                        websocket,
                        {
                            "type": "status",
                            "turbine_id": turbine_id,
                            "damage": turbine.cumulative_damage,
                            "alert_level": turbine.alert_level,
                            "rul_days": turbine.rul_days,
                            "records_processed": turbine.total_records_processed,
                            "last_update": (
                                turbine.last_prediction_at.isoformat()
                                if turbine.last_prediction_at
                                else None
                            ),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                    )

        except WebSocketDisconnect:
            manager.disconnect(turbine_id, websocket)
            logger.info(f"Client disconnected from {turbine_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=4000, reason="Internal error")
        except:
            pass


async def broadcast_turbine_update(turbine_id: str, prediction_data: dict):
    """
    Викликається з роутерів прогнозу для розсилки нових прогнозів усім клієнтам моніторингу.
    """
    message = {
        "type": "prediction",
        "turbine_id": turbine_id,
        "data": prediction_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast(turbine_id, message)


async def broadcast_alert(turbine_id: str, alert_level: str, message: str):
    """Розсилає тривогу всім клієнтам, що моніторять турбіну."""
    alert_message = {
        "type": "alert",
        "turbine_id": turbine_id,
        "alert_level": alert_level,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast(turbine_id, alert_message)
