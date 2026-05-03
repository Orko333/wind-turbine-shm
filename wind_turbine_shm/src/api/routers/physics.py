"""Фізично обґрунтовані аеродинамічні розрахунки та аналіз вітрового навантаження."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, Optional, List
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...physics.aerodynamics import AerodynamicModel, WindProfile, OffshoreLoading, AerodynamicState

router = APIRouter(prefix="/physics", tags=["physics"])

# Глобальні аеродинамічні моделі для кожної турбіни
aero_models: Dict[str, AerodynamicModel] = {}


class AerodynamicConfigRequest(BaseModel):
    """Конфігурація аеродинамічної моделі."""
    turbine_id: str
    rotor_diameter: float = Field(120.0, description="Rotor diameter [m]")
    tower_height: float = Field(100.0, description="Tower height [m]")
    rated_power_kw: float = Field(3000.0, description="Rated power [kW]")
    rated_wind_speed: float = Field(12.0, description="Rated wind speed [m/s]")
    cut_in_speed: float = Field(3.0, description="Cut-in wind speed [m/s]")
    cut_out_speed: float = Field(25.0, description="Cut-out wind speed [m/s]")


class AerodynamicStateResponse(BaseModel):
    """Відповідь з аеродинамічним станом."""
    wind_speed: float
    rotor_speed: float
    pitch_angle: float
    thrust_force: float = Field(..., description="Thrust force [kN]")
    rotor_power: float = Field(..., description="Rotor power [kW]")
    tower_moment: float = Field(..., description="Tower base moment [kNm]")
    tip_speed_ratio: float = Field(..., description="TSR (dimensionless)")


class TowerLoadRequest(BaseModel):
    """Запит на розрахунок навантаження на башту."""
    turbine_id: str
    wind_speed: float = Field(..., ge=0, description="Wind speed [m/s]")
    rotor_speed: float = Field(..., ge=0, description="Rotor speed [RPM]")
    pitch_angle: float = Field(0.0, description="Pitch angle [degrees]")
    rotor_mass: float = Field(500.0, description="Rotor mass [tons]")
    nacelle_mass: float = Field(250.0, description="Nacelle mass [tons]")


class TowerLoadResponse(BaseModel):
    """Відповідь з навантаженнями на башту."""
    turbine_id: str
    tower_moment: float = Field(..., description="Bending moment [kNm]")
    thrust_force: float = Field(..., description="Thrust force [kN]")
    power_output: float = Field(..., description="Power output [kW]")
    warning: Optional[str] = None


class PowerCurvePointRequest(BaseModel):
    """Одна точка на кривій потужності."""
    wind_speed: float = Field(..., ge=0, le=30)
    pitch_angle: float = Field(0.0, ge=-90, le=90)


class PowerCurveResponse(BaseModel):
    """Відповідь з кривою потужності."""
    wind_speed: float
    power_kw: float
    cp: float = Field(..., description="Power coefficient")
    ct: float = Field(..., description="Thrust coefficient")


class OffshoreLoadingRequest(BaseModel):
    """Морське навантаження від хвиль і течії."""
    turbine_id: str
    significant_wave_height: float = Field(3.0, ge=0, description="Wave height [m]")
    peak_frequency: float = Field(0.1, gt=0, description="Peak wave frequency [Hz]")
    current_velocity: float = Field(0.5, ge=0, description="Current velocity [m/s]")
    water_depth: float = Field(50.0, gt=0, description="Water depth [m]")


class OffshoreLoadResponse(BaseModel):
    """Відповідь з морськими навантаженнями."""
    turbine_id: str
    wave_drag_force_kn: float
    wave_inertia_force_kn: float
    current_force_kn: float
    total_horizontal_load_kn: float
    warning: Optional[str] = None


@router.post("/configure/{turbine_id}")
async def configure_aerodynamics(
    request: AerodynamicConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Налаштовує аеродинамічну модель для турбіни."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Створюємо аеродинамічну модель
        model = AerodynamicModel(
            rotor_diameter=request.rotor_diameter,
            tower_height=request.tower_height,
            rated_power=request.rated_power_kw,
            rated_wind_speed=request.rated_wind_speed,
            cut_in_speed=request.cut_in_speed,
            cut_out_speed=request.cut_out_speed,
        )

        aero_models[request.turbine_id] = model

        logger.info(f"Aerodynamic model configured for {request.turbine_id}")

        return {
            "status": "configured",
            "turbine_id": request.turbine_id,
            "rotor_diameter": request.rotor_diameter,
            "tower_height": request.tower_height,
            "rotor_area_m2": float(model.rotor_area),
        }

    except Exception as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-state", response_model=AerodynamicStateResponse)
async def calculate_aerodynamic_state(
    request: TowerLoadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AerodynamicStateResponse:
    """Розраховує повний аеродинамічний стан."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in aero_models:
        aero_models[request.turbine_id] = AerodynamicModel(
            rotor_diameter=112.0, tower_height=100.0, rated_power=3000.0,
            rated_wind_speed=12.5, cut_in_speed=3.5, cut_out_speed=25.0,
        )

    try:
        model = aero_models[request.turbine_id]

        state: AerodynamicState = model.calculate_state(
            wind_speed=request.wind_speed,
            rotor_speed=request.rotor_speed,
            pitch_angle=request.pitch_angle,
            rotor_mass=request.rotor_mass,
            nacelle_mass=request.nacelle_mass,
        )

        return AerodynamicStateResponse(
            wind_speed=state.wind_speed,
            rotor_speed=state.rotor_speed,
            pitch_angle=state.pitch_angle,
            thrust_force=state.thrust_force,
            rotor_power=state.rotor_power,
            tower_moment=state.tower_moment,
            tip_speed_ratio=state.tip_speed_ratio,
        )

    except Exception as e:
        logger.error(f"State calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tower-load", response_model=TowerLoadResponse)
async def calculate_tower_load(
    request: TowerLoadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TowerLoadResponse:
    """Розраховує згинальний момент та сили на башті."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in aero_models:
        aero_models[request.turbine_id] = AerodynamicModel(
            rotor_diameter=112.0, tower_height=100.0, rated_power=3000.0,
            rated_wind_speed=12.5, cut_in_speed=3.5, cut_out_speed=25.0,
        )

    try:
        model = aero_models[request.turbine_id]

        thrust = model.calculate_thrust(request.wind_speed, request.pitch_angle)
        moment = model.calculate_tower_moment(
            wind_speed=request.wind_speed,
            rotor_speed=request.rotor_speed,
            pitch_angle=request.pitch_angle,
            rotor_mass=request.rotor_mass,
            nacelle_mass=request.nacelle_mass,
        )
        power = model.calculate_power(request.wind_speed, request.pitch_angle)

        # Генеруємо попередження, якщо навантаження високі
        warning = None
        if moment > 100000:  # 100 МНм
            warning = "⚠️  High tower moment detected. Monitor for fatigue."

        logger.info(
            f"[{request.turbine_id}] Tower load: moment={moment:.1f} kNm, thrust={thrust:.1f} kN"
        )

        return TowerLoadResponse(
            turbine_id=request.turbine_id,
            tower_moment=moment,
            thrust_force=thrust,
            power_output=power,
            warning=warning,
        )

    except Exception as e:
        logger.error(f"Tower load calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/power-curve", response_model=List[PowerCurveResponse])
async def calculate_power_curve(
    turbine_id: str,
    pitch_angle: float = 0.0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[PowerCurveResponse]:
    """Розраховує криву потужності для діапазону швидкостей вітру."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in aero_models:
        aero_models[turbine_id] = AerodynamicModel(
            rotor_diameter=112.0, tower_height=100.0, rated_power=3000.0,
            rated_wind_speed=12.5, cut_in_speed=3.5, cut_out_speed=25.0,
        )

    try:
        model = aero_models[turbine_id]

        # Генеруємо криву потужності для швидкостей вітру 0-30 м/с
        wind_speeds = np.linspace(0, 30, 31)
        curve = []

        for ws in wind_speeds:
            power = model.calculate_power(ws, pitch_angle)
            cp = model.get_cp(8.5, pitch_angle)
            ct = model.get_thrust_coefficient(cp)

            curve.append(
                PowerCurveResponse(
                    wind_speed=float(ws),
                    power_kw=power,
                    cp=cp,
                    ct=ct,
                )
            )

        logger.info(f"Power curve generated for {turbine_id}")

        return curve

    except Exception as e:
        logger.error(f"Power curve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wind-shear")
async def calculate_wind_shear(
    turbine_id: str,
    wind_speed_at_hub: float = 10.0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Розраховує ефект зсуву вітру на роторі."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in aero_models:
        aero_models[turbine_id] = AerodynamicModel(
            rotor_diameter=112.0, tower_height=100.0, rated_power=3000.0,
            rated_wind_speed=12.5, cut_in_speed=3.5, cut_out_speed=25.0,
        )

    try:
        model = aero_models[turbine_id]
        wind_profile = WindProfile(reference_height=model.tower_height, reference_speed=wind_speed_at_hub)

        wind_top, wind_bottom = wind_profile.wind_shear_effect(
            model.tower_height,
            model.rotor_diameter,
        )

        stress_amplitude = wind_profile.wind_shear_stress(
            model.tower_height,
            model.rotor_diameter,
            thrust_coefficient=0.8,
        )

        logger.info(
            f"[{turbine_id}] Wind shear: top={wind_top:.2f} m/s, bottom={wind_bottom:.2f} m/s"
        )

        return {
            "turbine_id": turbine_id,
            "wind_speed_at_hub": wind_speed_at_hub,
            "wind_speed_rotor_top": float(wind_top),
            "wind_speed_rotor_bottom": float(wind_bottom),
            "wind_shear_exponent": 0.2,
            "cyclic_stress_amplitude": float(stress_amplitude),
            "info": "Wind shear creates cyclic 1P loading on rotor (once per rotation)",
        }

    except Exception as e:
        logger.error(f"Wind shear calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/offshore-loading", response_model=OffshoreLoadResponse)
async def calculate_offshore_loading(
    request: OffshoreLoadingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OffshoreLoadResponse:
    """Розраховує хвильове та течійне навантаження для морських турбін."""

    # Перевіряємо, чи належить турбіна користувачеві
    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        offshore = OffshoreLoading(water_depth=request.water_depth)

        # Оцінюємо сили, спричинені хвилями (спрощено)
        # Типова швидкість частинок води для Hs=3 м, пікового періоду=10 с
        particle_velocity = 2.0  # м/с (спрощена оцінка)
        particle_acceleration = 0.5  # м/с² (спрощена оцінка)

        morison = offshore.morison_force(
            water_particle_velocity=particle_velocity,
            water_particle_acceleration=particle_acceleration,
            member_diameter=5.0,
            member_length=request.water_depth,
        )

        # Навантаження від течії
        current_force = offshore.current_loading(
            current_velocity=request.current_velocity,
            member_diameter=5.0,
            member_length=request.water_depth,
        )

        total_load = (morison["drag_force_n"] + morison["inertia_force_n"] + current_force) / 1000  # Переводимо в кН

        warning = None
        if total_load > 5000:  # > 5000 кН
            warning = "⚠️  High offshore loading. Inspect support structure."

        logger.info(
            f"[{request.turbine_id}] Offshore loads: wave_drag={morison['drag_force_n']/1000:.1f} kN, "
            f"wave_inertia={morison['inertia_force_n']/1000:.1f} kN, current={current_force/1000:.1f} kN"
        )

        return OffshoreLoadResponse(
            turbine_id=request.turbine_id,
            wave_drag_force_kn=morison["drag_force_n"] / 1000,
            wave_inertia_force_kn=morison["inertia_force_n"] / 1000,
            current_force_kn=current_force / 1000,
            total_horizontal_load_kn=total_load,
            warning=warning,
        )

    except Exception as e:
        logger.error(f"Offshore loading error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
