"""Розширені ендпоінти симуляції: інтеграція OpenFAST та ROM для FEM."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
import numpy as np
from loguru import logger

from ...database.config import get_db
from ...database.models import User, Turbine
from ..dependencies import get_current_user
from ...physics.openfast_wrapper import OpenFASTWrapper, OpenFASTConfig, OpenFASTAnalyzer
from ...physics.rom import TowerProperties, TowerFEMModel, ReducedOrderModel, ROMAnalyzer

router = APIRouter(prefix="/simulation-advanced", tags=["advanced_simulation"])

# Глобальні екземпляри
openfast_wrapper = OpenFASTWrapper()
fem_models: Dict[str, TowerFEMModel] = {}
rom_models: Dict[str, ReducedOrderModel] = {}


class OpenFASTSimulationRequest(BaseModel):
    """Запит для аеро-серво-пружного моделювання OpenFAST."""
    turbine_id: str
    wind_speed: float = Field(10.0, description="Wind speed at hub [m/s]")
    turbulence_intensity: float = Field(0.12, description="Turbulence intensity [0-1]")
    wind_shear_exponent: float = Field(0.2, description="Wind shear exponent")
    simulation_time_sec: float = Field(600.0, description="Simulation duration [seconds]")
    timestep: float = Field(0.005, description="Timestep [seconds]")


class OpenFASTResult(BaseModel):
    """Результати моделювання OpenFAST."""
    turbine_id: str
    status: str  # success, fallback
    simulation_time_sec: float
    mean_power_kw: float
    max_tower_moment_knm: float
    mean_tower_moment_knm: float
    dominant_frequency_hz: float
    method: str  # "openfast" або "fallback"


class ROMConfigRequest(BaseModel):
    """Налаштування моделі зниженого порядку (ROM)."""
    turbine_id: str
    tower_height: float = Field(100.0, description="Tower height [m]")
    diameter_base: float = Field(3.5, description="Base diameter [m]")
    diameter_top: float = Field(2.5, description="Top diameter [m]")
    thickness: float = Field(0.035, description="Wall thickness [m]")
    n_retained_modes: int = Field(3, description="Number of modes to retain in ROM")


class ROMStressAnalysisRequest(BaseModel):
    """Запит на аналіз напружень за допомогою ROM."""
    turbine_id: str
    force_base_kn: float = Field(..., description="Applied horizontal force [kN]")


class ROMStressAnalysisResult(BaseModel):
    """Результат аналізу напружень ROM."""
    turbine_id: str
    max_displacement_m: float
    max_moment_knm: float
    max_stress_mpa: float
    utilization_ratio: float
    safety_status: str  # safe, warning, critical


class DynamicSimulationRequest(BaseModel):
    """Запит на динамічне моделювання ROM."""
    turbine_id: str
    wind_speed_timeseries: List[float] = Field(..., description="Wind speeds over time [m/s]")
    dt: float = Field(0.005, description="Timestep [seconds]")


class DynamicSimulationResult(BaseModel):
    """Результати динамічного моделювання."""
    turbine_id: str
    max_stress_mpa: float
    max_displacement_m: float
    cumulative_damage: float
    years_to_failure: float
    fatigue_status: str  # safe, degraded


# ==================== Ендпоінти OpenFAST ====================

@router.post("/openfast/run", response_model=OpenFASTResult)
async def run_openfast_simulation(
    request: OpenFASTSimulationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OpenFASTResult:
    """
    Запускає високоточне аеро-серво-пружне моделювання за допомогою OpenFAST.

    Моделює аеродинамічні навантаження, відгук системи керування та структурну динаміку.
    Перемикається на спрощену фізику, якщо OpenFAST недоступний.
    """

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Створюємо конфігурацію OpenFAST
        config = OpenFASTConfig(
            wind_speed=request.wind_speed,
            turbulence_intensity=request.turbulence_intensity,
            wind_shear_exponent=request.wind_shear_exponent,
            simulation_time=request.simulation_time_sec,
            timestep=request.timestep,
        )

        # Запускаємо моделювання
        results = openfast_wrapper.run_simulation(config)

        # Витягуємо ключові метрики
        analyzer = OpenFASTAnalyzer()
        fatigue_loads = analyzer.extract_fatigue_loads(results)
        dynamic_props = analyzer.extract_dynamic_properties(results)

        data = results.get("data", {})
        powers = data.get("generator_power", [0])
        moments = data.get("tower_base_moment", [0])

        logger.info(
            f"[{request.turbine_id}] OpenFAST simulation complete: "
            f"method={results['status']}, mean_power={np.mean(powers):.0f} kW"
        )

        return OpenFASTResult(
            turbine_id=request.turbine_id,
            status=results["status"],
            simulation_time_sec=request.simulation_time_sec,
            mean_power_kw=float(np.mean(powers)) if powers else 0.0,
            max_tower_moment_knm=float(fatigue_loads.get("max_moment_knm", 0)),
            mean_tower_moment_knm=float(fatigue_loads.get("mean_moment_knm", 0)),
            dominant_frequency_hz=float(dynamic_props.get("dominant_frequency_hz", 0)),
            method="openfast" if results["status"] == "success" else "fallback",
        )

    except Exception as e:
        logger.error(f"OpenFAST simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/openfast/status")
async def openfast_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Перевіряє доступність OpenFAST."""
    return {
        "openfast_available": openfast_wrapper.is_available,
        "executable": openfast_wrapper.openfast_exe,
        "fallback_available": True,
        "message": "OpenFAST is available" if openfast_wrapper.is_available else "Using simplified physics fallback",
    }


# ==================== Ендпоінти ROM/FEM ====================

@router.post("/rom/configure/{turbine_id}")
async def configure_rom(
    turbine_id: str,
    request: ROMConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Налаштовує модель зниженого порядку (ROM) для турбіни."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    try:
        # Створюємо властивості башти
        props = TowerProperties(
            height=request.tower_height,
            diameter_base=request.diameter_base,
            diameter_top=request.diameter_top,
            thickness=request.thickness,
        )

        # Будуємо FEM-модель
        fem = TowerFEMModel(props, n_elements=10)
        fem_models[turbine_id] = fem

        # Створюємо ROM
        rom = ReducedOrderModel(fem, n_retained_modes=request.n_retained_modes)
        rom_models[turbine_id] = rom

        # Отримуємо модальні властивості
        modal_props = fem.get_modal_properties()

        logger.info(
            f"ROM configured for {turbine_id}: "
            f"height={request.tower_height}m, "
            f"modes={request.n_retained_modes}, "
            f"frequencies={modal_props['frequencies_hz'][:2]} Hz"
        )

        return {
            "status": "configured",
            "turbine_id": turbine_id,
            "n_retained_modes": request.n_retained_modes,
            "natural_frequencies_hz": modal_props["frequencies_hz"][:request.n_retained_modes],
            "method": "Reduced Order Model (ROM) with modal basis reduction",
        }

    except Exception as e:
        logger.error(f"ROM configuration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rom/analyze-stress", response_model=ROMStressAnalysisResult)
async def analyze_rom_stress(
    request: ROMStressAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ROMStressAnalysisResult:
    """Виконує статичний аналіз напружень за допомогою ROM (значно швидше за повну FEM)."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in rom_models:
        raise HTTPException(
            status_code=503,
            detail="ROM not configured for this turbine"
        )

    try:
        rom = rom_models[request.turbine_id]

        # Розраховуємо статичний відгук
        response = rom.static_response(request.force_base_kn)

        # Оцінюємо безпеку
        analyzer = ROMAnalyzer()
        safety = analyzer.assess_stress_safety(response["max_stress_mpa"])

        logger.info(
            f"[{request.turbine_id}] ROM stress analysis: "
            f"force={request.force_base_kn} kN, "
            f"stress={response['max_stress_mpa']:.1f} MPa, "
            f"status={safety['status']}"
        )

        return ROMStressAnalysisResult(
            turbine_id=request.turbine_id,
            max_displacement_m=response["max_displacement_m"],
            max_moment_knm=response["max_moment_knm"],
            max_stress_mpa=response["max_stress_mpa"],
            utilization_ratio=float(safety["utilization_ratio"]),
            safety_status=safety["status"],
        )

    except Exception as e:
        logger.error(f"ROM stress analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rom/dynamic-simulation", response_model=DynamicSimulationResult)
async def dynamic_rom_simulation(
    request: DynamicSimulationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DynamicSimulationResult:
    """Виконує динамічне моделювання з часозалежними навантаженнями за допомогою ROM."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == request.turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if request.turbine_id not in rom_models:
        raise HTTPException(status_code=503, detail="ROM not configured")

    try:
        rom = rom_models[request.turbine_id]

        # Перетворюємо швидкості вітру на сили (спрощено: F = wind^2 * constant)
        wind_speeds = np.array(request.wind_speed_timeseries)
        forces_kn = 0.0005 * (wind_speeds ** 2)  # Груба апроксимація

        # Запускаємо динамічне моделювання
        response = rom.dynamic_response(forces_kn, dt=request.dt)

        # Аналізуємо втому
        stresses = np.array(response["stresses_mpa"])
        analyzer = ROMAnalyzer()
        fatigue = analyzer.fatigue_life_estimate(stresses)

        logger.info(
            f"[{request.turbine_id}] Dynamic simulation: "
            f"max_stress={response['max_stress_mpa']:.1f} MPa, "
            f"years_to_failure={fatigue['estimated_years_to_failure']:.1f}"
        )

        return DynamicSimulationResult(
            turbine_id=request.turbine_id,
            max_stress_mpa=response["max_stress_mpa"],
            max_displacement_m=response["max_displacement_m"],
            cumulative_damage=float(fatigue["cumulative_damage"]),
            years_to_failure=float(fatigue["estimated_years_to_failure"]),
            fatigue_status=fatigue["status"],
        )

    except Exception as e:
        logger.error(f"Dynamic simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rom/modal-properties/{turbine_id}")
async def get_rom_modal_properties(
    turbine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Повертає модальні властивості (власні частоти, демпфування, форми коливань)."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in rom_models:
        raise HTTPException(status_code=503, detail="ROM not configured")

    try:
        rom = rom_models[turbine_id]

        return {
            "turbine_id": turbine_id,
            "natural_frequencies_hz": rom.frequencies.tolist(),
            "damping_ratios": rom.damping_ratios.tolist(),
            "n_retained_modes": len(rom.frequencies),
        }

    except Exception as e:
        logger.error(f"Error retrieving modal properties: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rom/mrao/{turbine_id}")
async def compute_mrao(
    turbine_id: str,
    freq_min: float = 0.1,
    freq_max: float = 5.0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Обчислює модальний оператор амплітудної характеристики (MRAO) для прогнозування частотного відгуку."""

    turbine = db.query(Turbine).filter(
        (Turbine.turbine_id == turbine_id) & (Turbine.owner_id == current_user.id)
    ).first()

    if not turbine:
        raise HTTPException(status_code=404, detail="Turbine not found")

    if turbine_id not in rom_models:
        raise HTTPException(status_code=503, detail="ROM not configured")

    try:
        rom = rom_models[turbine_id]
        mrao = rom.get_mrao(frequency_range=(freq_min, freq_max))

        return {
            "turbine_id": turbine_id,
            "frequencies_hz": mrao["frequencies_hz"],
            "amplitudes": mrao["amplitudes"],
            "peak_frequency_hz": mrao["peak_frequency_hz"],
            "peak_amplitude": mrao["peak_amplitude"],
        }

    except Exception as e:
        logger.error(f"MRAO computation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
