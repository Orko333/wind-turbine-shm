/**
 * useToast Hook
 * Custom hook for displaying toast notifications with auto-dismiss
 */

import { useCallback, useEffect, useRef } from "react";
import { useToastStore, type ToastType } from "../store/toast";

interface UseToastReturn {
  toast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const DEFAULT_DISMISS_TIME = 5000; // 5 seconds
const ERROR_DISMISS_TIME = 8000; // 8 seconds for errors
const MAX_TOASTS_ON_SCREEN = 3;

/**
 * useToast Hook - Provides toast notification functionality
 * @returns Toast function and type-specific shortcuts
 */
export function useToast(): UseToastReturn {
  const { addToast, removeToast, toasts } = useToastStore();
  const timeoutRefsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Auto-dismiss toasts
  useEffect(() => {
    // Only keep the most recent MAX_TOASTS_ON_SCREEN toasts
    const visibleToasts = toasts.slice(0, MAX_TOASTS_ON_SCREEN);
    const hiddenToasts = toasts.slice(MAX_TOASTS_ON_SCREEN);
    const timeoutRefs = timeoutRefsRef.current;

    // Immediately remove hidden toasts
    hiddenToasts.forEach((toast) => {
      removeToast(toast.id);
    });

    // Встановити up auto-dismiss for visible toasts
    visibleToasts.forEach((toast) => {
      if (!timeoutRefs.has(toast.id)) {
        const dismissTime = toast.type === "error" ? ERROR_DISMISS_TIME : DEFAULT_DISMISS_TIME;

        const timeout = setTimeout(() => {
          removeToast(toast.id);
          timeoutRefs.delete(toast.id);
        }, dismissTime);

        timeoutRefs.set(toast.id, timeout);
      }
    });

    // Cleanup: remove timeouts for toasts that no longer exist
    return () => {
      timeoutRefs.forEach((timeout, id) => {
        if (!visibleToasts.find((t) => t.id === id)) {
          clearTimeout(timeout);
          timeoutRefs.delete(id);
        }
      });
    };
  }, [toasts, removeToast]);

  const toast = useCallback(
    (message: string, type: ToastType) => {
      return addToast(message, type);
    },
    [addToast]
  );

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);
  const warning = useCallback((message: string) => toast(message, "warning"), [toast]);
  const info = useCallback((message: string) => toast(message, "info"), [toast]);

  return {
    toast,
    success,
    error,
    warning,
    info,
  };
}
