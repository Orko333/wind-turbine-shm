'use client';

import { useRealtimeStore } from '@/store/realtime';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function ConnectionIndicator() {
  const { isConnected, connectionError } = useRealtimeStore();
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    setIsReconnecting(!isConnected && connectionError !== null);
  }, [isConnected, connectionError]);

  const state = isConnected ? 'live' : isReconnecting ? 'reconnect' : 'offline';

  const dotClass = {
    live:      'bg-live',
    reconnect: 'bg-warn',
    offline:   'bg-crit',
  }[state];

  const label = {
    live:      'LIVE',
    reconnect: 'RETRY',
    offline:   'OFFLINE',
  }[state];

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full surface-2 hairline border">
      <div className={cn('relative w-1.5 h-1.5 rounded-full', dotClass)}>
        {isConnected && (
          <span className="absolute inset-0 rounded-full bg-live opacity-60 animate-ping" />
        )}
      </div>
      <span className="mono text-[10px] tracking-widest ink-2">{label}</span>
    </div>
  );
}
