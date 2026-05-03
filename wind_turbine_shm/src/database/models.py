"""Моделі бази даних SQLAlchemy."""

import json as _json
import os as _os
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator

from .config import Base


class _UUIDType(TypeDecorator):
    """UUID stored as VARCHAR(36) — works with SQLite and PostgreSQL."""
    impl = String(36)
    cache_ok = True

    def __init__(self, as_uuid: bool = False, **kw):
        self.as_uuid = as_uuid
        super().__init__(**kw)

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return uuid.UUID(str(value)) if self.as_uuid else str(value)


class _JSONType(TypeDecorator):
    """JSON stored as TEXT — works with SQLite and PostgreSQL."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return _json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, str):
            return _json.loads(value)
        return value


_DATABASE_URL = _os.getenv("DATABASE_URL", "sqlite:///./wind_turbine.db")
if _DATABASE_URL.startswith("postgresql"):
    from sqlalchemy.dialects.postgresql import UUID, JSONB  # type: ignore[assignment]
else:
    UUID = _UUIDType   # type: ignore[misc,assignment]
    JSONB = _JSONType  # type: ignore[misc,assignment]


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    turbines = relationship("Turbine", back_populates="owner")
    audit_logs = relationship("AuditLog", back_populates="user")

    def __repr__(self):
        return f"<User {self.username}>"


class Turbine(Base):
    __tablename__ = "turbines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turbine_id = Column(String(50), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Метадані
    name = Column(String(255), nullable=False)
    location = Column(String(255))
    manufacturer = Column(String(255))
    model = Column(String(255))
    rated_power_kw = Column(Float)
    installation_date = Column(DateTime(timezone=True))
    description = Column(Text)

    # Поточний стан здоров'я
    cumulative_damage = Column(Float, default=0.0)
    damage_fraction = Column(Float, default=0.0)
    alert_level = Column(String(20), default="GREEN")  # GREEN, YELLOW, ORANGE, RED
    rul_days = Column(Float, nullable=True)

    # Статистика
    total_records_processed = Column(Integer, default=0)
    last_prediction_at = Column(DateTime(timezone=True), nullable=True)

    # Часові мітки
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="turbines")
    predictions = relationship("TurbinePrediction", back_populates="turbine", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Turbine {self.turbine_id}>"


class TurbinePrediction(Base):
    __tablename__ = "turbine_predictions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turbine_id = Column(UUID(as_uuid=True), ForeignKey("turbines.id"), nullable=False)

    # Часова мітка прогнозу
    prediction_timestamp = Column(DateTime(timezone=True), nullable=False)

    # Прогноз пошкодження
    damage_index = Column(Float, nullable=False)
    damage_class = Column(String(20))  # HEALTHY, WARNING, CRITICAL

    # Ймовірності класів (JSON)
    class_probabilities = Column(JSONB)  # {"Healthy": 0.8, "Warning": 0.15, "Critical": 0.05}

    # Оцінка RUL
    rul_days = Column(Float, nullable=True)
    rul_confidence_lower = Column(Float, nullable=True)
    rul_confidence_upper = Column(Float, nullable=True)

    # DEL (еквівалентне навантаження пошкодження)
    del_mpa = Column(Float, nullable=True)

    # Попередження
    alert_level = Column(String(20))  # GREEN, YELLOW, ORANGE, RED
    alert_message = Column(Text)

    # Пояснення SHAP (необов'язково, у форматі JSON)
    shap_explanation = Column(JSONB, nullable=True)

    # Вхідні ознаки (для аудиту)
    input_features = Column(JSONB, nullable=True)

    # Часові мітки
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    turbine = relationship("Turbine", back_populates="predictions")

    def __repr__(self):
        return f"<TurbinePrediction {self.id}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Деталі дії
    action = Column(String(100), nullable=False, index=True)  # напр.: "predict", "reset_turbine", "register_turbine"
    resource_type = Column(String(50), nullable=False)  # напр.: "turbine", "prediction"
    resource_id = Column(String(100), nullable=True)

    # Деталі
    details = Column(JSONB)
    status = Column(String(20), default="success")  # успіх, помилка
    error_message = Column(Text, nullable=True)

    # Часові мітки
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog {self.action} on {self.resource_type}>"
