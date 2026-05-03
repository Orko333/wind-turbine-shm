/**
 * ToastContainer Component
 * Displays toast notifications at the bottom-right of the screen
 */

'use client';

import { useToastStore } from '@/store/toast';
import { Toast } from './Toast';

export function ToastContainer() {
  const { toasts } = useToastStore();

  return (
    <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 pointer-events-none">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {toasts.map((toast: any) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
}
