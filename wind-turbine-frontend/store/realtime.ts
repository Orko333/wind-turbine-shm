/**
 * Realtime Store
 * Manages real-time turbine дані streaming via WebSocket
 */

import { create } from "zustand";
import type { TurbineRealtimeData } from "../types/api";

interface RealtimeDataCache {
  [turbineId: string]: {
    data: TurbineRealtimeData;
    timestamp: number;
    isStale: boolean;
  };
}

interface RealtimeState {
  turbineData: RealtimeDataCache;
  isConnected: boolean;
  lastConnected: number | null;
  connectionError: string | null;
}

interface RealtimeActions {
  updateTurbineData: (turbineId: string, data: TurbineRealtimeData) => void;
  setConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setLastConnected: (timestamp: number | null) => void;
  getTurbineData: (turbineId: string) => TurbineRealtimeData | null;
  clearOldData: (maxAgeMs?: number) => void;
  clearAllData: () => void;
  isDataStale: (turbineId: string, maxAgeMs?: number) => boolean;
}

type RealtimeStore = RealtimeState & RealtimeActions;

const initialState: RealtimeState = {
  turbineData: {},
  isConnected: false,
  lastConnected: null,
  connectionError: null,
};

const DEFAULT_MAX_AGE_MS = 3600000; // 1 hour

export const useRealtimeStore = create<RealtimeStore>((set, get) => ({
  ...initialState,

  updateTurbineData: (turbineId, data) => {
    const now = Date.now();
    set((state) => ({
      turbineData: {
        ...state.turbineData,
        [turbineId]: {
          data,
          timestamp: now,
          isStale: false,
        },
      },
    }));
  },

  setConnected: (connected) => {
    set({
      isConnected: connected,
      lastConnected: connected ? Date.now() : get().lastConnected,
      connectionError: connected ? null : get().connectionError,
    });
  },

  setConnectionError: (error) => {
    set({ connectionError: error });
  },

  setLastConnected: (timestamp) => {
    set({ lastConnected: timestamp });
  },

  getTurbineData: (turbineId) => {
    const cached = get().turbineData[turbineId];
    return cached ? cached.data : null;
  },

  clearOldData: (maxAgeMs = DEFAULT_MAX_AGE_MS) => {
    const now = Date.now();
    set((state) => {
      const filteredData: RealtimeDataCache = {};

      Object.entries(state.turbineData).forEach(([turbineId, entry]) => {
        const age = now - entry.timestamp;
        if (age < maxAgeMs) {
          filteredData[turbineId] = entry;
        }
      });

      return { turbineData: filteredData };
    });
  },

  clearAllData: () => {
    set({ turbineData: {} });
  },

  isDataStale: (turbineId, maxAgeMs = 60000) => {
    const cached = get().turbineData[turbineId];
    if (!cached) return true;

    const age = Date.now() - cached.timestamp;
    return age > maxAgeMs;
  },
}));
