// API Constants
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
export const API_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || "30000");
export const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:8000/ws";

// Cache Duration (milliseconds)
export const CACHE_DURATIONS = {
  TURBINE_LIST: 10 * 60 * 1000,      // 10 min
  TURBINE_DETAIL: 10 * 60 * 1000,    // 10 min
  HISTORICAL_DATA: 30 * 60 * 1000,   // 30 min
  PHYSICS_CURVES: 60 * 60 * 1000,    // 1 hour
  CONFIG: 5 * 60 * 1000,             // 5 min
  SCADA_STATUS: 5 * 60 * 1000,       // 5 min
  USER_PROFILE: 60 * 60 * 1000,      // 1 hour
};

// WebSocket Config
export const WEBSOCKET_RECONNECT_ATTEMPTS = 5;
export const WEBSOCKET_RECONNECT_INTERVAL = 1000;
export const WEBSOCKET_MAX_RECONNECT_DELAY = 30000;

// UI Constants
export const TOAST_AUTO_DISMISS_MS = 5000;
export const TOAST_ERROR_DISMISS_MS = 8000;
export const SKELETON_ANIMATION_DURATION = 1500;

// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Turbine Status Colors
export const TURBINE_STATUS_COLORS = {
  healthy: "#00AA00",
  warning: "#FFA500",
  critical: "#DD3333",
  offline: "#999999",
};

// Chart Colors
export const CHART_COLORS = {
  primary: "#0066CC",
  secondary: "#FF9933",
  danger: "#DD3333",
  success: "#00AA00",
  warning: "#FFA500",
  info: "#0099FF",
};

// Role Permissions
export const ROLE_PERMISSIONS = {
  engineer: {
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: true,
    canRunSimulations: true,
    canViewAnalytics: true,
    canManageUsers: false,
    canAccessAdmin: false,
  },
  operator: {
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: false,
    canRunSimulations: false,
    canViewAnalytics: true,
    canManageUsers: false,
    canAccessAdmin: false,
  },
  manager: {
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: false,
    canRunSimulations: false,
    canViewAnalytics: true,
    canManageUsers: false,
    canAccessAdmin: false,
  },
  admin: {
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: true,
    canRunSimulations: true,
    canViewAnalytics: true,
    canManageUsers: true,
    canAccessAdmin: true,
  },
};

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
  REFRESH: "/auth/refresh",

  // Turbines
  TURBINES: "/turbines",
  TURBINE_DETAIL: (id: string) => `/turbines/${id}`,
  TURBINE_STATUS: (id: string) => `/turbines/${id}/status`,

  // Analytics
  DAMAGE_HISTORY: (id: string) => `/analytics/damage-history/${id}`,
  RUL_FORECAST: (id: string) => `/analytics/rul-forecast/${id}`,
  ALERTS: "/analytics/alerts",

  // Physics
  POWER_CURVE: "/physics/power-curve",
  WIND_SHEAR: "/physics/wind-shear",
  THRUST_MOMENT: "/physics/thrust-moment",

  // Fatigue
  RAINFLOW: (id: string) => `/analytics/rainflow/${id}`,
  S_N_CURVE: "/analytics/s-n-curve",
  GOODMAN: (id: string) => `/analytics/goodman/${id}`,

  // Simulations
  OPENFAST_RUN: "/simulation-advanced/openfast/run",
  ROM_CONFIGURE: (id: string) => `/simulation-advanced/rom/configure/${id}`,
  ROM_STRESS: "/simulation-advanced/rom/analyze-stress",
  ROM_DYNAMIC: "/simulation-advanced/rom/dynamic-simulation",

  // SCADA
  SCADA_STATUS: "/scada/status",
  SCADA_DATA: "/scada/data",

  // Health
  HEALTH: "/health",
};
