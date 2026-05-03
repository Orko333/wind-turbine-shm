/**
 * useTurbineData Hook
 * Unified дані fetching combining TanStack Query + WebSocket real-time дані
 */

import { useQuery } from "@tanstack/react-query";
import type { QueryObserverResult } from "@tanstack/react-query";
import { useRealtime } from "./useRealtime";
import { getApiWithAuth } from "../lib/api";
import type { Turbine, TurbineDetail, TurbineRealtimeData, Alert } from "../types/api";

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

      const response = await getApiWithAuth<TurbineDetail>(
        `/turbines/${turbineId}`
      );
      return response;
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

  return {
    turbine,
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
