/**
 * Хук useWebSocket
 * Управляє WebSocket-з'єднанням з автоматичним перепідключенням та обробкою помилок
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { WebSocketMessage } from "../types/domain";

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  maxRetries?: number;
  reconnectDelay?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: WebSocketMessage) => void;
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RECONNECT_DELAY = 3000;

function getUiLocale(): 'en' | 'uk' {
  if (typeof window === 'undefined') return 'uk';
  try {
    const saved = localStorage.getItem('helios.locale');
    return saved === 'en' ? 'en' : 'uk';
  } catch {
    return 'uk';
  }
}

const WS_MESSAGES = {
  en: {
    wsError: 'WebSocket error occurred',
    createError: 'Failed to create WebSocket',
    parseError: 'Failed to parse WebSocket message:',
  },
  uk: {
    wsError: 'Сталася помилка WebSocket',
    createError: 'Не вдалося створити WebSocket',
    parseError: 'Не вдалося розібрати повідомлення WebSocket:',
  },
} as const;

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = DEFAULT_WS_URL,
    autoConnect = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    onOpen,
    onClose,
    onError,
    onMessage,
  } = options;

  // Зберігаємо коллбеки в ref-ах, щоб обробники були стабільними попри зміну пропсів
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;
  onMessageRef.current = onMessage;

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Стабільні обробники — ніколи не перестворюються
  const handleOpen = useCallback(() => {
    isConnectedRef.current = true;
    isConnectingRef.current = false;
    setIsConnected(true);
    setIsConnecting(false);
    setError(null);
    retriesRef.current = 0;

    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const message = messageQueueRef.current.shift();
      if (message) wsRef.current.send(JSON.stringify(message));
    }

    onOpenRef.current?.();
  }, []);

  const handleClose = useCallback(() => {
    isConnectedRef.current = false;
    isConnectingRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    onCloseRef.current?.();
  }, []);

  const handleError = useCallback((event: Event) => {
    const locale = getUiLocale();
    setError(WS_MESSAGES[locale].wsError);
    onErrorRef.current?.(event);
  }, []);

  const handleMessage = useCallback((event: MessageEvent<string>) => {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      onMessageRef.current?.(message);
    } catch (err) {
      const locale = getUiLocale();
      console.error(WS_MESSAGES[locale].parseError, err);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    isConnectedRef.current = false;
    isConnectingRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    messageQueueRef.current = [];
  }, []);

  const connect = useCallback(() => {
    if (isConnectingRef.current || isConnectedRef.current || wsRef.current) return;

    isConnectingRef.current = true;
    setIsConnecting(true);

    try {
      wsRef.current = new WebSocket(url);
      wsRef.current.onopen = handleOpen;
      wsRef.current.onclose = handleClose;
      wsRef.current.onerror = handleError;
      wsRef.current.onmessage = handleMessage;
    } catch (err) {
      const locale = getUiLocale();
      const errorMsg = err instanceof Error ? err.message : WS_MESSAGES[locale].createError;
      setError(errorMsg);
      isConnectingRef.current = false;
      setIsConnecting(false);
    }
  }, [url, handleOpen, handleClose, handleError, handleMessage]);

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  // Автоматичне підключення при монтуванні (стабільні залежності — запускається лише один раз)
  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Перепідключення після розриву (експоненційний backoff)
  useEffect(() => {
    if (!isConnected && !isConnecting && retriesRef.current < maxRetries) {
      const delay = reconnectDelay * Math.pow(2, retriesRef.current);
      const timer = setTimeout(() => {
        retriesRef.current += 1;
        connect();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isConnecting, maxRetries, reconnectDelay, connect]);

  return { isConnected, isConnecting, error, connect, disconnect, send };
}
