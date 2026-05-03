"""
Pydantic v2 схеми для REST API системи моніторингу стану вітрової турбіни.

Тут визначено всі моделі запитів і відповідей.
"""

from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class DamageClass(str, Enum):
    HEALTHY = "Healthy"
    WARNING = "Warning"
    CRITICAL = "Critical"


class AlertLevel(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    ORANGE = "ORANGE"
    RED = "RED"


# ------------------------------------------------------------------ #
#  Схеми запитів                                                       #
# ------------------------------------------------------------------ #

class SCADAWindowRequest(BaseModel):
    """
    Один 10-хвилинний запис SCADA-даних для онлайн-аналізу.
    Усі фізичні значення мають бути в межах допустимих робочих діапазонів.
    """

    turbine_id: str = Field(..., description="Унікальний ідентифікатор турбіни")
    timestamp: str = Field(..., description="Мітка часу вікна SCADA у форматі ISO-8601")
    wind_speed_mean: float = Field(..., ge=0.0, le=50.0, description="Середня швидкість вітру [м/с]")
    wind_speed_std: float = Field(..., ge=0.0, le=20.0, description="Стандартне відхилення швидкості вітру [м/с]")
    rotor_speed_rpm: float = Field(..., ge=0.0, le=25.0, description="Частота обертання ротора [об/хв]")
    pitch_angle_deg: float = Field(..., ge=0.0, le=90.0, description="Кут кроку лопатей [градуси]")
    active_power_kw: float = Field(..., ge=0.0, le=3000.0, description="Активна потужність [кВт]")
    tower_base_moment_kNm: float = Field(..., ge=0.0, description="Згинальний момент у основі башти [кНм]")
    tower_top_accel_rms: float = Field(..., ge=0.0, description="СКЗ прискорення верхівки башти [м/с²]")
    nacelle_temp_degC: float = Field(..., ge=-40.0, le=80.0, description="Температура гондоли [°C]")

    @field_validator("wind_speed_mean")
    @classmethod
    def wind_in_range(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Швидкість вітру не може бути від'ємною.")
        return v


class HFSignalRequest(BaseModel):
    """Вікно високочастотного сигналу для виявлення аномалій."""

    turbine_id: str
    timestamp: str
    sampling_rate_hz: float = Field(default=100.0, ge=10.0, le=1000.0)
    strain_microstrain: List[float] = Field(..., min_length=100)
    accel_ms2: List[float] = Field(..., min_length=100)

    @field_validator("accel_ms2")
    @classmethod
    def same_length(cls, v: List[float], info) -> List[float]:
        if "strain_microstrain" in info.data and len(v) != len(info.data["strain_microstrain"]):
            raise ValueError("strain_microstrain та accel_ms2 мають бути однакової довжини.")
        return v


class BatchSCADARequest(BaseModel):
    """Пакет SCADA-записів для масового аналізу."""

    records: List[SCADAWindowRequest] = Field(..., min_length=1, max_length=1000)


# ------------------------------------------------------------------ #
#  Схеми відповідей                                                   #
# ------------------------------------------------------------------ #

class DamagePredictionResponse(BaseModel):
    turbine_id: str
    timestamp: str
    damage_index: float = Field(..., description="Кумулятивне пошкодження за Пальмгреном-Майнером D ∈ [0,1]")
    damage_class: DamageClass
    class_probabilities: dict[str, float]
    rul_days: Optional[float] = Field(None, description="Залишковий корисний ресурс [дні]")
    rul_confidence_lower: Optional[float] = None
    rul_confidence_upper: Optional[float] = None
    del_mpa: Optional[float] = Field(None, description="Еквівалентне пошкоджувальне навантаження [МПа]")
    alert_level: AlertLevel
    alert_message: str
    shap_explanation: Optional[dict] = None


class AnomalyDetectionResponse(BaseModel):
    turbine_id: str
    timestamp: str
    anomaly_score: float = Field(..., description="Похибка реконструкції — чим вище, тим більш аномально")
    is_anomaly: bool
    threshold: float
    natural_frequency_hz: Optional[float] = Field(None, description="Розрахункова перша власна частота башти [Гц]")


class HealthCheckResponse(BaseModel):
    status: str
    version: str
    models_loaded: dict[str, bool]


class TurbineStatusResponse(BaseModel):
    turbine_id: str
    cumulative_damage: float
    damage_fraction: float
    alert_level: AlertLevel
    rul_days: Optional[float]
    last_update: str
    total_records_processed: int


class SCADAStepRequest(BaseModel):
    """Один SCADA-запис у складі послідовності для LSTM."""
    wind_speed_mean: float = Field(..., ge=0.0, le=50.0)
    wind_speed_std: float = Field(..., ge=0.0, le=20.0)
    rotor_speed_rpm: float = Field(..., ge=0.0, le=25.0)
    pitch_angle_deg: float = Field(..., ge=0.0, le=90.0)
    active_power_kw: float = Field(..., ge=0.0, le=3000.0)
    tower_base_moment_kNm: float = Field(..., ge=0.0)
    tower_top_accel_rms: float = Field(..., ge=0.0)
    nacelle_temp_degC: float = Field(..., ge=-40.0, le=80.0)


class LSTMRULRequest(BaseModel):
    """Послідовність із 24 SCADA-записів для прогнозування через LSTM."""
    turbine_id: str
    timestamp: str
    sequence: List[SCADAStepRequest] = Field(
        ..., min_length=24, max_length=24,
        description="Рівно 24 послідовних 10-хвилинних SCADA-вікна (4 години)",
    )


class LSTMRULResponse(BaseModel):
    turbine_id: str
    timestamp: str
    predicted_damage_index: float = Field(
        ..., description="Прогнозований індекс пошкодження на наступному кроці (LSTM)"
    )
    attention_weights: List[float] = Field(
        ..., description="Ваги уваги для 24 кроків — показують, які записи найважливіші"
    )
    alert_level: AlertLevel
    alert_message: str


class TurbineRegisterRequest(BaseModel):
    """Реєстрація нової турбіни у системі моніторингу."""
    turbine_id: str = Field(..., description="Унікальний ідентифікатор турбіни")
    initial_damage: float = Field(default=0.0, ge=0.0, le=1.0, description="Початковий індекс пошкодження")


# ------------------------------------------------------------------ #
#  Розширені схеми для БД управління турбінами                        #
# ------------------------------------------------------------------ #

class TurbineCreateRequest(BaseModel):
    """Додавання турбіни з повними метаданими."""
    turbine_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    rated_power_kw: Optional[float] = None
    installation_date: Optional[str] = None  # ISO-8601 datetime


class TurbineUpdateRequest(BaseModel):
    """Оновлення метаданих турбіни."""
    name: Optional[str] = None
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    rated_power_kw: Optional[float] = None
    description: Optional[str] = None


class TurbineDetailResponse(BaseModel):
    """Повна інформація про турбіну."""
    id: str
    turbine_id: str
    name: str
    location: Optional[str]
    manufacturer: Optional[str]
    model: Optional[str]
    rated_power_kw: Optional[float]
    installation_date: Optional[str]
    cumulative_damage: float
    damage_fraction: float
    alert_level: AlertLevel
    rul_days: Optional[float]
    total_records_processed: int
    last_prediction_at: Optional[str]
    created_at: str
    updated_at: str


class PredictionHistoryResponse(BaseModel):
    """Історія одного прогнозу."""
    id: str
    turbine_id: str
    prediction_timestamp: str
    damage_index: float
    damage_class: Optional[DamageClass]
    class_probabilities: Optional[dict]
    rul_days: Optional[float]
    rul_confidence_lower: Optional[float]
    rul_confidence_upper: Optional[float]
    del_mpa: Optional[float]
    alert_level: AlertLevel
    alert_message: str
    created_at: str


class TurbinePredictionListResponse(BaseModel):
    """Список прогнозів для турбіни з пагінацією."""
    turbine_id: str
    total_count: int
    limit: int
    offset: int
    predictions: List[PredictionHistoryResponse]
