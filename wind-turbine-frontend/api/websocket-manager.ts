/**
 * Менеджер WebSocket.
 * Керує центральним з'єднанням, перепідключенням,
 * підписками на канали та очищенням застарілих даних.
 */

import type { WebSocketMessage } from "@/types/domain";
import type { TurbineRealtimeData } from "@/types/api";
import { useRealtimeStore } from "@/store/realtime";
import { useToastStore } from "@/store/toast";

interface ManagerCallbacks {
  onConnectionChange?: (isConnected: boolean) => void;
  onDataReceived?: (turbineId: string, data: TurbineRealtimeData) => void;
  onError?: (error: string) => void;
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const MAX_RETRIES = 5;
const INITIAL_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;
const DATA_CLEANUP_INTERVAL = 3600000; // 1 година
const DATA_MAX_AGE = 3600000; // 1 година

function getUiLocale(): 'en' | 'uk' {
  if (typeof window === 'undefined') return 'uk';
  try {
    const saved = localStorage.getItem('helios.locale');
    return saved === 'en' ? 'en' : 'uk';
  } catch {
    return 'uk';
  }
}

const WS_MANAGER_MESSAGES = {
  en: {
    failedCreate: 'Failed to create WebSocket',
    connected: 'Connected to live data',
    maxRetries: 'Connection lost. Max reconnection attempts reached.',
    genericError: 'WebSocket error occurred',
    parseError: 'Failed to parse WebSocket message:',
    invalidMessage: 'Invalid message format',
    unknownError: 'Unknown error',
  },
  uk: {
    failedCreate: 'Не вдалося створити WebSocket',
    connected: 'Підключено до потоку даних у реальному часі',
    maxRetries: 'Звʼязок втрачено. Вичерпано максимальну кількість спроб перепідключення.',
    genericError: 'Сталася помилка WebSocket',
    parseError: 'Не вдалося розібрати повідомлення WebSocket:',
    invalidMessage: 'Некоректний формат повідомлення',
    unknownError: 'Невідома помилка',
  },
} as const;

class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: WebSocket | null = null;
  private url: string;
  private retryCount = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private subscriptions: Set<string> = new Set();
  private callbacks: ManagerCallbacks = {};
  private isInitialized = false;

  private constructor(url: string = DEFAULT_WS_URL) {
    this.url = url;
  }

  /**
   * Отримати або створити одиночка-екземпляр.
   */
  public static getInstance(url?: string): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager(url);
    }
    return WebSocketManager.instance;
  }

  /**
   * Отримати стан zustand-сховищ поза React через getState().
   */
  private getStores() {
    return {
      realtimeStore: useRealtimeStore.getState(),
      toastStore: useToastStore.getState(),
    };
  }

  /**
   * Ініціалізувати WebSocket-з'єднання.
   */
  public initialize(callbacks?: ManagerCallbacks): void {
    if (this.isInitialized) return;

    this.callbacks = callbacks || {};
    this.connect();
    this.startCleanupTimer();
    this.isInitialized = true;
  }

  /**
   * Підключитися до WebSocket-сервера.
   */
  private connect(): void {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      const locale = getUiLocale();
      const message = error instanceof Error ? error.message : WS_MANAGER_MESSAGES[locale].failedCreate;
      this.handleConnectionError(message);
    }
  }

  /**
   * Обробник відкриття WebSocket-з'єднання.
   */
  private handleOpen(): void {
    const { realtimeStore, toastStore } = this.getStores();
    realtimeStore.setConnected(true);
    realtimeStore.setConnectionError(null);

    this.retryCount = 0;

    // Надсилаємо накопичені повідомлення
    this.flushMessageQueue();

    // Поновлюємо підписки на канали
    this.resubscribeAll();

    // Викликаємо callback, якщо передано
    this.callbacks.onConnectionChange?.(true);

    // Показуємо повідомлення користувачу
    const locale = getUiLocale();
    toastStore.addToast(WS_MANAGER_MESSAGES[locale].connected, "success");
  }

  /**
   * Обробник закриття WebSocket-з'єднання.
   */
  private handleClose(): void {
    const { realtimeStore, toastStore } = this.getStores();
    realtimeStore.setConnected(false);

    this.ws = null;

    // Пробуємо перепідключитися, якщо не вичерпано ліміт
    if (this.retryCount < MAX_RETRIES) {
      this.scheduleReconnect();
    } else {
      const locale = getUiLocale();
      const error = WS_MANAGER_MESSAGES[locale].maxRetries;
      realtimeStore.setConnectionError(error);
      this.callbacks.onError?.(error);

      toastStore.addToast(error, "error");
    }
  }

  /**
   * Обробник помилки WebSocket.
   */
  private handleError(_event: Event): void {
    const locale = getUiLocale();
    const message = WS_MANAGER_MESSAGES[locale].genericError;
    this.handleConnectionError(message);
    this.callbacks.onError?.(message);
  }

  /**
   * Обробник вхідних повідомлень WebSocket.
   */
  private handleMessage(event: MessageEvent<string>): void {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      this.processMessage(message);
    } catch (error) {
      const locale = getUiLocale();
      console.error(WS_MANAGER_MESSAGES[locale].parseError, error);
      this.callbacks.onError?.(WS_MANAGER_MESSAGES[locale].invalidMessage);
    }
  }

  /**
   * Обробити вхідне повідомлення.
   */
  private processMessage(message: WebSocketMessage): void {
    const { realtimeStore } = this.getStores();

    switch (message.type) {
      case "update": {
        if (message.channel?.startsWith("turbine:") && message.data) {
          const turbineId = message.channel.replace("turbine:", "");
          const data = this.validateTurbineData(message.data);

          if (data) {
            realtimeStore.updateTurbineData(turbineId, data);
            this.callbacks.onDataReceived?.(turbineId, data);
          }
        }
        break;
      }

      case "error": {
        const locale = getUiLocale();
        const error = message.error || WS_MANAGER_MESSAGES[locale].unknownError;
        realtimeStore.setConnectionError(error);
        this.callbacks.onError?.(error);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Перевірити структуру даних телеметрії турбіни.
   */
  private validateTurbineData(data: unknown): TurbineRealtimeData | null {
    if (
      typeof data === "object" &&
      data !== null &&
      "power_kw" in data &&
      "wind_speed" in data &&
      "timestamp" in data
    ) {
      return data as TurbineRealtimeData;
    }
    return null;
  }

  /**
   * Обробити помилку підключення.
   */
  private handleConnectionError(error: string): void {
    const { realtimeStore } = this.getStores();
    realtimeStore.setConnectionError(error);
    this.callbacks.onError?.(error);
  }

  /**
   * Запланувати перепідключення з експоненційною затримкою.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    this.retryCount += 1;
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.retryCount - 1),
      MAX_RECONNECT_DELAY
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Надіслати всі повідомлення з черги.
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Підписатися на канал.
   */
  public subscribe(turbineId: string): void {
    const channel = `turbine:${turbineId}`;

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.add(channel);
    }

    const message: WebSocketMessage = {
      type: "subscribe",
      channel,
    };

    this.sendMessage(message);
  }

  /**
   * Відписатися від каналу.
   */
  public unsubscribe(turbineId: string): void {
    const channel = `turbine:${turbineId}`;
    this.subscriptions.delete(channel);

    const message: WebSocketMessage = {
      type: "unsubscribe",
      channel,
    };

    this.sendMessage(message);
  }

  /**
   * Повторно підписатися на всі канали.
   */
  private resubscribeAll(): void {
    this.subscriptions.forEach((channel) => {
      const message: WebSocketMessage = {
        type: "subscribe",
        channel,
      };
      this.sendMessage(message);
    });
  }

  /**
   * Надіслати повідомлення.
   */
  private sendMessage(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Якщо немає з'єднання — додаємо в чергу
      this.messageQueue.push(message);
    }
  }

  /**
   * Запустити таймер очищення застарілих даних.
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const { realtimeStore } = this.getStores();
      realtimeStore.clearOldData(DATA_MAX_AGE);
    }, DATA_CLEANUP_INTERVAL);
  }

  /**
   * Отримати поточний стан з'єднання.
   */
  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Відключити WebSocket і виконати очищення стану.
   */
  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.messageQueue = [];
    this.isInitialized = false;
  }
}

export default WebSocketManager;
