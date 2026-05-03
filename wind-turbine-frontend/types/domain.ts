// Типи бізнес-домену
export type UserRole = "engineer" | "operator" | "manager" | "admin";

export interface RolePermissions {
  role: UserRole;
  canViewDashboard: boolean;
  canViewTurbines: boolean;
  canEditConfig: boolean;
  canRunSimulations: boolean;
  canViewAnalytics: boolean;
  canManageUsers: boolean;
  canAccessAdmin: boolean;
}

export interface WebSocketMessage {
  type: "subscribe" | "unsubscribe" | "update" | "error";
  channel: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface RealtimeSubscription {
  channel: string;
  subscriptions: string[];
  isConnected: boolean;
  retryCount: number;
}

export interface FilterState {
  turbineStatus?: string;
  location?: string;
  rulRange?: [number, number];
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface SimulationConfig {
  turbineId: string;
  windSpeed: number;
  turbulenceIntensity: number;
  simulationTimeSec: number;
  timestep: number;
}

export interface SimulationResult {
  status: "success" | "fallback";
  meanPowerKw: number;
  maxTowerMomentKnm: number;
  meanTowerMomentKnm: number;
  dominantFrequencyHz: number;
  method: "openfast" | "fallback";
}
