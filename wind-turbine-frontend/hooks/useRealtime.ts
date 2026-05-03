/**
 * useRealtime Hook
 * Manages real-time turbine дані subscriptions via WebSocket
 */

import { useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useRealtimeStore } from "../store/realtime";
import type { WebSocketMessage } from "../types/domain";
import type { TurbineRealtimeData } from "../types/api";

interface UseRealtimeOptions {
  turbineIds?: string[];
  autoSubscribe?: boolean;
  onDataUpdate?: (turbineId: string, data: TurbineRealtimeData) => void;
  onError?: (error: string) => void;
}

interface UseRealtimeReturn {
  isConnected: boolean;
  subscribe: (turbineId: string) => void;
  unsubscribe: (turbineId: string) => void;
  getTurbineData: (turbineId: string) => TurbineRealtimeData | null;
  isDataStale: (turbineId: string, maxAgeMs?: number) => boolean;
  clearOldData: (maxAgeMs?: number) => void;
  clearAllData: () => void;
}

/**
 * useRealtime Hook - Manages real-time turbine дані subscriptions
 * @param options Configuration options
 * @returns Realtime дані state and control functions
 */
export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const {
    turbineIds = [],
    autoSubscribe = true,
    onDataUpdate,
    onError,
  } = options;

  const {
    isConnected: wsConnected,
    send,
  } = useWebSocket({
    autoConnect: autoSubscribe,
    onMessage: handleWebSocketMessage,
    onError: (event) => {
      onError?.(`WebSocket error: ${event.type}`);
    },
  });

  const {
    isConnected,
    updateTurbineData,
    setConnected,
    setConnectionError,
    getTurbineData,
    isDataStale,
    clearOldData,
    clearAllData,
  } = useRealtimeStore();

  // Обробити incoming WebSocket повідомлення
  function handleWebSocketMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case "update":
        if (message.channel?.startsWith("turbine:") && message.data) {
          const turbineId = message.channel.replace("turbine:", "");
          const data = message.data as unknown as TurbineRealtimeData;
          updateTurbineData(turbineId, data);
          onDataUpdate?.(turbineId, data);
        }
        break;

      case "error": {
        const errorMsg = message.error || "Unknown error";
        setConnectionError(errorMsg);
        onError?.(errorMsg);
        break;
      }

      default:
        break;
    }
  }

  // Оновити connection state when WebSocket стан changes
  useEffect(() => {
    setConnected(wsConnected);
  }, [wsConnected, setConnected]);

  // Subscribe to initial turbines
  useEffect(() => {
    turbineIds.forEach((turbineId) => {
      const message: WebSocketMessage = {
        type: "subscribe",
        channel: `turbine:${turbineId}`,
      };
      send(message);
    });
  }, [turbineIds, send]);

  const subscribe = useCallback(
    (turbineId: string) => {
      const message: WebSocketMessage = {
        type: "subscribe",
        channel: `turbine:${turbineId}`,
      };
      send(message);
    },
    [send]
  );

  const unsubscribe = useCallback(
    (turbineId: string) => {
      const message: WebSocketMessage = {
        type: "unsubscribe",
        channel: `turbine:${turbineId}`,
      };
      send(message);
    },
    [send]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Unsubscribe from all turbines
      turbineIds.forEach((turbineId) => {
        const message: WebSocketMessage = {
          type: "unsubscribe",
          channel: `turbine:${turbineId}`,
        };
        send(message);
      });
    };
  }, [turbineIds, send]);

  return {
    isConnected,
    subscribe,
    unsubscribe,
    getTurbineData,
    isDataStale,
    clearOldData,
    clearAllData,
  };
}
