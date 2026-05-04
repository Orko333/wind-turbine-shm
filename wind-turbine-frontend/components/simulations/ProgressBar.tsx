'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface ProgressBarProps {
  progress: number; // 0-100
  isRunning: boolean;
  eta?: number; // у секундах
  label?: string;
}

export function ProgressBar({
  progress,
  isRunning,
  eta,
  label = 'Running simulation...',
}: ProgressBarProps) {
  const [displayEta, setDisplayEta] = useState(eta);

  useEffect(() => {
    if (!eta) return;

    const interval = setInterval(() => {
      setDisplayEta((prev) => {
        if (prev === undefined || prev <= 0) {
          clearInterval(interval);
          return undefined;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [eta]);

  const formatTime = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium ink-2">{label}</p>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold signal-live">
              {progress.toFixed(0)}%
            </span>
            {displayEta !== undefined && (
              <span className="text-sm ink-3">
                ETA: {formatTime(displayEta)}
              </span>
            )}
          </div>
        </div>

        {/* Індикатор прогресу */}
        <div className="relative h-3 w-full surface-3 rounded-full overflow-hidden">
          <div
            className="h-full surface-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
          {/* Ефект анімованого мерехтіння */}
          {isRunning && (
            <div
              className="absolute inset-0 h-full w-1/4 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"
              style={{
                animation: 'shimmer 2s infinite',
              }}
            />
          )}
        </div>

        {/* Точки статусу */}
        <div className="flex gap-1">
          {[0, 25, 50, 75, 100].map((checkpoint) => (
            <div
              key={checkpoint}
              className={`h-2 w-2 rounded-full transition-colors ${
                progress >= checkpoint
                  ? 'surface-3'
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>
    </Card>
  );
}
