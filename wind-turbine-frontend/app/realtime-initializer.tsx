/**
 * RealtimeInitializer Component
 * Initializes global WebSocket-з'єднання on app load
 * Should be rendered at the root level
 */

'use client';

import { useEffect } from 'react';
import { useWebSocketManager } from '@/hooks/useWebSocketManager';
import { useToast } from '@/hooks/useToast';
import { useT } from '@/lib/i18n';

export function RealtimeInitializer() {
  const { warning, info } = useToast();
  const t = useT();

  // Initialize WebSocket manager globally
  const { isConnected } = useWebSocketManager({
    autoInitialize: true,
    onConnectionChange: (connected: boolean) => {
      if (connected) {
        info(t('common.realtime_connected'));
      } else {
        warning(t('common.realtime_disconnected'));
      }
    },
    onError: (error: string) => {
      console.error('WebSocket error:', error);
    },
  });

  // Log connection стан for debugging
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('WebSocket connected:', isConnected());
  }, [isConnected]);

  return null; // This component doesn't render anything
}
