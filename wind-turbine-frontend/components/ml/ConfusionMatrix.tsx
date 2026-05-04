'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ConfusionMatrixProps {
  matrix: number[][];
  labels: string[];
  isLoading?: boolean;
  title?: string;
  description?: string;
}

export function ConfusionMatrix({
  matrix,
  labels,
  isLoading = false,
  title = 'Матриця плутанини',
  description = 'Фактичні vs прогнозовані класи пошкоджень',
}: ConfusionMatrixProps) {
  const maxValue = useMemo(() => {
    return Math.max(...matrix.flat());
  }, [matrix]);

  const getColor = (value: number): string => {
    const intensity = value / maxValue;
    if (intensity === 0) return 'surface-1 dark:bg-gray-800';
    if (intensity < 0.3) return 'surface-3 dark:bg-blue-900';
    if (intensity < 0.6) return 'bg-blue-300 dark:bg-blue-700';
    if (intensity < 0.9) return 'surface-20 dark:surface-20';
    return 'bg-blue-700 dark:bg-blue-300';
  };

  const getTextColor = (value: number): string => {
    const intensity = value / maxValue;
    return intensity > 0.5 ? 'text-white' : 'ink-1 dark:text-gray-100';
  };

  const accuracy = useMemo(() => {
    let correct = 0;
    let total = 0;
    for (let i = 0; i < matrix.length; i++) {
      correct += matrix[i][i];
      total += matrix[i].reduce((a, b) => a + b, 0);
    }
    return total === 0 ? 0 : (correct / total) * 100;
  }, [matrix]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-96 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Заголовок */}
        <div>
          <h3 className="text-lg font-semibold ink-1 dark:text-white">
            {title}
          </h3>
          <p className="text-sm ink-3 dark:text-gray-400 mt-1">
            {description}
          </p>
        </div>

        {/* Показник точності */}
        <div className="surface-2 dark:bg-blue-900/30 rounded-lg p-4 border hairline dark:border-blue-800">
          <p className="text-sm ink-3 dark:text-gray-400">Gаальна точність</p>
          <p className="text-2xl font-bold signal-live dark:ink-3">{accuracy.toFixed(1)}%</p>
        </div>

        {/* Матриця */}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex">
              {/* Підписи осі Y */}
              <div className="flex flex-col">
                {/* Верхній кут */}
                <div className="w-24 h-12" />
                {/* Підписи рядків */}
                {labels.map((label, i) => (
                  <div
                    key={`y-label-${i}`}
                    className="w-24 h-12 flex items-center justify-center text-sm font-medium ink-2 dark:text-gray-300 border-b hairline dark:border-gray-700"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Вміст матриці */}
              <div className="flex-1">
                {/* Підписи стовпців */}
                <div className="flex">
                  {labels.map((label, i) => (
                    <div
                      key={`x-label-${i}`}
                      className="flex-1 h-12 flex items-center justify-center text-sm font-medium ink-2 dark:text-gray-300 border-b hairline dark:border-gray-700"
                    >
                      <span className="transform -rotate-45 whitespace-nowrap text-xs">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Комірки матриці */}
                {matrix.map((row, i) => (
                  <div key={`row-${i}`} className="flex">
                    {row.map((value, j) => (
                      <div
                        key={`cell-${i}-${j}`}
                        className={`flex-1 h-12 flex items-center justify-center font-semibold text-sm border-b hairline dark:border-gray-700 ${getColor(
                          value
                        )} ${getTextColor(value)}`}
                      >
                        {value}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Легенда */}
        <div className="pt-4 space-y-2">
          <p className="text-sm font-medium ink-2 dark:text-gray-300">Легенда</p>
          <p className="text-xs ink-3 dark:text-gray-400">
            Rows: True labels | Columns: Predicted labels
          </p>
          <div className="flex gap-2 flex-wrap mt-2">
            {[0.25, 0.5, 0.75, 1.0].map((intensity) => (
              <div
                key={intensity}
                className="flex items-center gap-2"
              >
                <div
                  className={`w-4 h-4 rounded ${getColor(intensity * maxValue)}`}
                />
                <span className="text-xs ink-3 dark:text-gray-400">
                  {(intensity * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
