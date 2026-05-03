// Типи відповідей API
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: "success" | "error";
  timestamp: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  role: "engineer" | "operator" | "manager" | "admin";
  name: string;
  created_at: string;
}

export interface Turbine {
  turbine_id: string;
  name: string;
  status: "healthy" | "warning" | "critical" | "offline";
  power_kw: number;
  wind_speed: number;
  rotor_rpm: number;
  rul_years: number;
  damage_rate: number;
  last_update: string;
  owner_id: string;
}

export interface TurbineDetail extends Turbine {
  tower_height: number;
  rotor_diameter: number;
  rated_power_kw: number;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface TurbineRealtimeData {
  power_kw: number;
  wind_speed: number;
  rotor_rpm: number;
  pitch_angle: number;
  tower_moment_knm: number;
  blade_load_kn: number;
  vibration_mms: number;
  temperature_c: number;
  timestamp: string;
}

export interface Alert {
  id: string;
  turbine_id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  created_at: string;
  acknowledged: boolean;
}

export interface DamageData {
  timestamp: string;
  cumulative_damage: number;
  rul_years: number;
}

export interface ChartDataPoint {
  x: number | string;
  y: number;
  label?: string;
}
