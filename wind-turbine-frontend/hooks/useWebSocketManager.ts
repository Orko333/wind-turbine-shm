/**
 * useWebSocketManager Hook
 * Provides access to the global WebSocket manager with proper очищення
 */

import { useEffect, useCallback, useRef } from 'react';
import WebSocketManager from '@/api/websocket-manager';
import type { TurbineRealtimeData } from '@/types/api';

interface UseWebSocketManagerOptions {
  autoInitialize?: boolean;
  onConnectionChange?: (isConnected: boolean) => void;
  onDataReceived?: (turbineId: string, data: TurbineRealtimeData) => void;
  onError?: (error: string) => void;
}

export function useWebSocketManager(options: UseWebSocketManagerOptions = {}) {
  const {
    autoInitialize = true,
    onConnectionChange,
    onDataReceived,
    onError,
  } = options;

  const managerRef = useRef<WebSocketManager | null>(null);

  // Initialize manager
  useEffect(() => {
    if (autoInitialize) {
      managerRef.current = WebSocketManager.getInstance();
      managerRef.current.initialize({
        onConnectionChange,
        onDataReceived,
        onError,
      });
    }

    return () => {
      // Cleanup is handled by manager itself
      // Don't відключити on unmount to keep global connection alive
    };
  }, [autoInitialize, onConnectionChange, onDataReceived, onError]);

  const subscribe = useCallback((turbineId: string) => {
    managerRef.current?.subscribe(turbineId);
  }, []);

  const unsubscribe = useCallback((turbineId: string) => {
    managerRef.current?.unsubscribe(turbineId);
  }, []);

  const isConnected = useCallback((): boolean => {
    return managerRef.current?.isConnected() ?? false;
  }, []);

  return {
    subscribe,
    unsubscribe,
    isConnected,
  };
}
