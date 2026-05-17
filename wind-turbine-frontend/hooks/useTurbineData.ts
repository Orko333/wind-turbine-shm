/**
 * useTurbineData Hook
 * Unified дані fetching combining TanStack Query + WebSocket real-time дані
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryObserverResult } from "@tanstack/react-query";
import { useRealtime } from "./useRealtime";
import { getApiWithAuth } from "../lib/api";
import { loadLocal } from "../lib/localStore";
import type { Turbine, TurbineDetail, TurbineRealtimeData, Alert } from "../types/api";

interface StoredTurbineSettings {
  tower_height?: number;
  rotor_diameter?: number;
  rated_power_kw?: number;
  cut_in_speed?: number;
  cut_out_speed?: number;
}

interface UseTurbineDataOptions {
  turbineId?: string;
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchInterval?: number;
  useRealtime?: boolean;
}

interface UseTurbineDataReturn {
  turbine: TurbineDetail | null;
  realtimeData: TurbineRealtimeData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<QueryObserverResult<TurbineDetail, Error>>;
  isRealtimeConnected: boolean;
}

const DEFAULT_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_TIME = 10 * 60 * 1000; // 10 minutes
const DEFAULT_REFETCH_INTERVAL = 30 * 1000; // 30 seconds

const EMPTY_TURBINES: Turbine[] = [];

/**
 * Backend `/turbines/{id}` returns a stripped payload missing some fields
 * the UI expects (status, power_kw, wind_speed, rotor_rpm, rul_years,
 * damage_rate, tower_height, rotor_diameter). Derive what we can from
 * what's present and default the rest so .toFixed() never blows up.
 */
function normalizeTurbineDetail(raw: Record<string, unknown> & Partial<TurbineDetail>): TurbineDetail {
  const rulDays = (raw.rul_days as number) ?? 0;
  const cumulativeDamage = (raw.cumulative_damage as number) ?? 0;
  const alertLevel = (raw.alert_level as string) ?? 'GREEN';
  const statusByLevel: Record<string, Turbine['status']> = {
    GREEN: 'healthy',
    YELLOW: 'warning',
    ORANGE: 'warning',
    RED: 'critical',
    BLACK: 'offline',
  };

  return {
    ...raw,
    status: (raw.status as Turbine['status']) ?? statusByLevel[alertLevel] ?? 'healthy',
    power_kw: (raw.power_kw as number) ?? 0,
    wind_speed: (raw.wind_speed as number) ?? 0,
    rotor_rpm: (raw.rotor_rpm as number) ?? 0,
    rul_years: (raw.rul_years as number) ?? rulDays / 365,
    damage_rate: (raw.damage_rate as number) ?? cumulativeDamage * 100,
    tower_height: (raw.tower_height as number) ?? (raw.tower_height_m as number) ?? 0,
    rotor_diameter: (raw.rotor_diameter as number) ?? (raw.rotor_diameter_m as number) ?? 0,
    rated_power_kw: (raw.rated_power_kw as number) ?? 0,
    last_update: (raw.last_update as string) ?? (raw.updated_at as string) ?? '',
    owner_id: (raw.owner_id as string) ?? '',
  } as TurbineDetail;
}

/**
 * useTurbineData Hook - Unified turbine дані fetching (Query + Realtime)
 * @param options Configuration options
 * @returns Turbine дані with real-time updates
 */
export function useTurbineData(
  options: UseTurbineDataOptions = {}
): UseTurbineDataReturn {
  const {
    turbineId,
    enabled = Boolean(turbineId),
    staleTime = DEFAULT_STALE_TIME,
    cacheTime = DEFAULT_CACHE_TIME,
    refetchInterval = DEFAULT_REFETCH_INTERVAL,
    useRealtime: useRealtimeData = true,
  } = options;

  // Fetch turbine detail from API
  const {
    data: turbine = null,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["turbine", turbineId],
    queryFn: async () => {
      if (!turbineId) throw new Error("Turbine ID is required");

      const response = await getApiWithAuth<Record<string, unknown> & TurbineDetail>(
        `/turbines/${turbineId}`
      );
      return normalizeTurbineDetail(response);
    },
    enabled,
    staleTime,
    gcTime: cacheTime,
    refetchInterval,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
  });

  // Subscribe to real-time дані
  const { isConnected: isRealtimeConnected, getTurbineData } = useRealtime({
    turbineIds: turbineId ? [turbineId] : [],
    autoSubscribe: useRealtimeData && Boolean(turbineId),
  });

  // Отримати the latest real-time дані for this turbine
  const realtimeData = turbineId ? getTurbineData(turbineId) : null;

  // Merge user-edited overrides from the settings page (localStorage) on top
  // of the backend response so the rest of the dashboard reflects them.
  const turbineWithOverrides = useMemo<TurbineDetail | null>(() => {
    if (!turbine || !turbineId) return turbine;
    const stored = loadLocal<StoredTurbineSettings>(`turbine-settings:${turbineId}`);
    if (!stored) return turbine;
    return {
      ...turbine,
      tower_height: stored.tower_height ?? turbine.tower_height,
      rotor_diameter: stored.rotor_diameter ?? turbine.rotor_diameter,
      rated_power_kw: stored.rated_power_kw ?? turbine.rated_power_kw,
    };
  }, [turbine, turbineId]);

  return {
    turbine: turbineWithOverrides,
    realtimeData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    isRealtimeConnected,
  };
}

/**
 * useTurbineList Hook - Fetch list of turbines with optional filters
 */
interface UseTurbineListOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  location?: string;
  enabled?: boolean;
  staleTime?: number;
}

interface UseTurbineListReturn {
  turbines: Turbine[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<QueryObserverResult<{
    data: Turbine[];
    total: number;
  }, Error>>;
}

export function useTurbineList(
  options: UseTurbineListOptions = {}
): UseTurbineListReturn {
  const {
    page = 1,
    pageSize = 10,
    status,
    location,
    enabled = true,
    staleTime = DEFAULT_STALE_TIME,
  } = options;

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.set("page", page.toString());
  queryParams.set("page_size", pageSize.toString());
  if (status) queryParams.set("status", status);
  if (location) queryParams.set("location", location);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<{
    data: Turbine[];
    total: number;
  }>({
    queryKey: ["turbines", page, pageSize, status, location],
    queryFn: async () => {
      const response = await getApiWithAuth<{
        data: Turbine[];
        total: number;
      }>(`/turbines/?${queryParams.toString()}`);
      return response;
    },
    enabled,
    staleTime,
    gcTime: DEFAULT_CACHE_TIME,
    retry: 2,
  });

  return {
    turbines: data?.data ?? EMPTY_TURBINES,
    total: data?.total || 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * useTurbineAlerts Hook - Fetch turbine alerts
 */
interface UseTurbineAlertsOptions {
  turbineId?: string;
  severity?: string;
  enabled?: boolean;
  staleTime?: number;
}

export function useTurbineAlerts(
  options: UseTurbineAlertsOptions = {}
) {
  const {
    turbineId,
    severity,
    enabled = Boolean(turbineId),
    staleTime = 2 * 60 * 1000, // 2 minutes
  } = options;

  const queryParams = new URLSearchParams();
  if (turbineId) queryParams.set("turbine_id", turbineId);
  if (severity) queryParams.set("severity", severity);

  return useQuery<Alert[]>({
    queryKey: ["turbine-alerts", turbineId, severity],
    queryFn: async () => {
      const response = await getApiWithAuth<Alert[]>(
        `/alerts/?${queryParams.toString()}`
      );
      return response;
    },
    enabled,
    staleTime,
    gcTime: DEFAULT_CACHE_TIME,
    retry: 1,
  });
}
