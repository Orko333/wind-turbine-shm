/**
 * Toast Component
 * Individual toast notification with icon and close button
 */

'use client';

import { useToastStore } from '@/store/toast';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: any;
}

export function Toast({ toast }: ToastProps) {
  const { removeToast } = useToastStore();

  const typeConfig = {
    success: {
      bg: 'surface-2 hairline border',
      text: 'signal-live',
      icon: <CheckCircle2 className="w-5 h-5 signal-live" />,
    },
    error: {
      bg: 'surface-2 hairline border',
      text: 'signal-crit',
      icon: <AlertCircle className="w-5 h-5 signal-crit" />,
    },
    warning: {
      bg: 'surface-2 hairline border',
      text: 'signal-warn',
      icon: <AlertTriangle className="w-5 h-5 signal-warn" />,
    },
    info: {
      bg: 'surface-2 hairline border',
      text: 'ink-2',
      icon: <Info className="w-5 h-5 signal-live" />,
    },
  };

  const config = typeConfig[toast.type as keyof typeof typeConfig];

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border animate-in slide-in-from-right-5 fade-in duration-300',
        config.bg,
        config.text
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 text-sm font-medium">{toast.message}</div>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 ml-2 inline-flex text-current opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
