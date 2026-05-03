"""
Realtime physics-based SCADA simulator.

Maintains per-turbine state and produces one realistic sample per tick using
the physics from `SCADADataGenerator` (Weibull wind, IEC 61400-1 turbulence,
thrust coefficient model, power curve, Palmgren-Miner damage accumulation).

Used by the dashboard WebSocket so connected clients see physics-consistent
streaming data instead of `random.uniform` placeholders.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional

import numpy as np

from ..data.generator import TurbineParameters, WeibullWindModel


@dataclass
class RealtimeSample:
    turbine_id: str
    timestamp: str
    wind_speed: float          # m/s
    wind_speed_std: float      # m/s — turbulence std
    rotor_rpm: float
    pitch_angle: float         # deg
    power_kw: float
    tower_moment_knm: float
    tower_top_accel_rms: float  # m/s²
    blade_load_kn: float
    vibration_mms: float       # mm/s, RMS-equivalent
    nacelle_temp_degC: float
    temperature_c: float       # alias of nacelle_temp_degC for the FE
    cumulative_damage: float


class TurbineRealtimeState:
    """Per-turbine physics state with persistent damage accumulation."""

    def __init__(
        self,
        turbine_id: str,
        params: Optional[TurbineParameters] = None,
        wind: Optional[WeibullWindModel] = None,
        seed: Optional[int] = None,
    ) -> None:
        self.turbine_id = turbine_id
        self.params = params or TurbineParameters()
        self.wind = wind or WeibullWindModel()
        # Stable seed per turbine_id so each turbine has its own pattern
        seed = seed if seed is not None else (hash(turbine_id) & 0xFFFF_FFFF)
        self.rng = np.random.default_rng(seed)

        # Wind state evolves slowly (10 min mean ± noise) using Ornstein-Uhlenbeck
        self.v_mean = float(self.rng.weibull(self.wind.shape_k) * self.wind.scale_c)
        self.cumulative_damage = 0.0
        self.last_emit_at: Optional[datetime] = None

    # --- physics helpers ---

    def _step_wind(self, dt_seconds: float) -> float:
        """Slow OU drift around Weibull-sampled mean; new sample every ~10 min."""
        # Reset to a new Weibull sample roughly every 600s
        if self.rng.random() < dt_seconds / 600.0:
            self.v_mean = float(self.rng.weibull(self.wind.shape_k) * self.wind.scale_c)
        # Add turbulent fluctuation
        sigma = self.wind.turbulence_intensity * (0.75 * self.v_mean + 5.6)
        v = self.v_mean + float(self.rng.normal(0.0, sigma * 0.4))
        return max(0.0, v)

    def _thrust(self, v: float) -> float:
        rho = self.params.air_density
        A = self.params.rotor_area
        v_rated = self.params.rated_wind_speed
        if v < self.params.cut_in_speed or v > self.params.cut_out_speed:
            return 0.0
        if v <= v_rated:
            C_T = self.params.thrust_coeff
        else:
            C_T = self.params.thrust_coeff * (v_rated / max(v, 1e-3)) ** 2
        return 0.5 * rho * A * C_T * v * v

    def _tower_moment_knm(self, F_thrust: float, sigma_v: float) -> float:
        H_eff = self.params.hub_height * 0.9
        M_mean = F_thrust * H_eff / 1e3
        delta = (
            0.5 * self.params.air_density * self.params.rotor_area
            * sigma_v * sigma_v * H_eff / 1e3
            * float(self.rng.normal(1.0, 0.15))
        )
        return float(M_mean + abs(delta))

    def _power_kw(self, v: float) -> float:
        v_ci = self.params.cut_in_speed
        v_co = self.params.cut_out_speed
        v_r = self.params.rated_wind_speed
        P_r = self.params.rated_power_kw
        if v < v_ci or v > v_co:
            return 0.0
        if v < v_r:
            return P_r * ((v - v_ci) / (v_r - v_ci)) ** 3
        return P_r

    def _rotor_rpm(self, v: float) -> float:
        v_ci = self.params.cut_in_speed
        v_r = self.params.rated_wind_speed
        if v < v_ci:
            return 0.0
        if v < v_r:
            return 6.0 + 8.0 * (v - v_ci) / (v_r - v_ci)
        return 14.0  # rated rpm

    def _pitch_deg(self, v: float) -> float:
        v_r = self.params.rated_wind_speed
        v_co = self.params.cut_out_speed
        if v < v_r:
            return 0.0
        return min(25.0, 25.0 * (v - v_r) / max(v_co - v_r, 1e-3))

    def _accumulate_damage(self, M_knm: float, dt_seconds: float) -> None:
        """Palmgren-Miner increment scaled to dt."""
        # Reference SN curve normalisation — cycles per 10-min equivalent
        # D_per_year ≈ M^3 / 1e12 at typical loads
        damage_rate = (M_knm / 8000.0) ** 3 * 1e-9
        self.cumulative_damage = min(1.0, self.cumulative_damage + damage_rate * dt_seconds)

    # --- public ---

    def tick(self) -> RealtimeSample:
        """Advance state and emit one realistic sample."""
        now = datetime.now(timezone.utc)
        if self.last_emit_at is None:
            dt = 2.0
        else:
            dt = max(0.1, (now - self.last_emit_at).total_seconds())
        self.last_emit_at = now

        v = self._step_wind(dt)
        sigma_v = self.wind.turbulence_intensity * (0.75 * self.v_mean + 5.6)
        F_T = self._thrust(v)
        M = self._tower_moment_knm(F_T, sigma_v)
        P = self._power_kw(v)
        rpm = self._rotor_rpm(v)
        pitch = self._pitch_deg(v)

        # Tower-top RMS acceleration scales with moment
        accel_rms = max(0.0, 0.1 + M / 200_000.0 + 0.05 * float(self.rng.standard_normal()))
        # Blade root load proxy [kN]
        blade_load = max(0.0, F_T / 3.0 / 1e3 + 5.0 * float(self.rng.standard_normal()))
        # Vibration in mm/s (rough RMS converted from m/s²)
        omega = 2 * math.pi * self.params.first_eigenfreq
        vibration_mms = (accel_rms / max(omega, 1e-3)) * 1000.0
        # Nacelle temperature (warmer with power)
        nacelle_T = 30.0 + 20.0 * (v / 15.0) + float(self.rng.normal(0.0, 1.0))

        self._accumulate_damage(M, dt)

        return RealtimeSample(
            turbine_id=self.turbine_id,
            timestamp=now.isoformat(),
            wind_speed=round(v, 2),
            wind_speed_std=round(sigma_v, 3),
            rotor_rpm=round(rpm, 2),
            pitch_angle=round(pitch, 2),
            power_kw=round(P, 1),
            tower_moment_knm=round(M, 1),
            tower_top_accel_rms=round(accel_rms, 4),
            blade_load_kn=round(blade_load, 2),
            vibration_mms=round(max(0.1, vibration_mms), 3),
            nacelle_temp_degC=round(nacelle_T, 2),
            temperature_c=round(nacelle_T, 2),
            cumulative_damage=round(self.cumulative_damage, 6),
        )


class RealtimeSimulatorRegistry:
    """Holds one TurbineRealtimeState per turbine_id."""

    def __init__(self) -> None:
        self._states: Dict[str, TurbineRealtimeState] = {}

    def get_or_create(self, turbine_id: str) -> TurbineRealtimeState:
        if turbine_id not in self._states:
            self._states[turbine_id] = TurbineRealtimeState(turbine_id)
        return self._states[turbine_id]

    def tick(self, turbine_id: str) -> RealtimeSample:
        return self.get_or_create(turbine_id).tick()


# Module-level singleton — shared across the WebSocket and the persistence task
realtime_registry = RealtimeSimulatorRegistry()
