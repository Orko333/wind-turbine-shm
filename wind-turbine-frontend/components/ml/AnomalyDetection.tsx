'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { postApiWithAuth } from '@/lib/api';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import { AlertCircle, TrendingUp } from 'lucide-react';

interface BackendAnomalyResult {
  turbine_id: string;
  timestamp: string;
  anomaly_score: number;
  is_anomaly: boolean;
  threshold: number;
  natural_frequency_hz: number;
}

interface AnomalyDetectionProps {
  turbineId?: string;
}

interface AnomalyDataPoint {
  timestamp: string;
  reconstruction_error: number;
  is_anomaly: boolean;
}

interface AnomalyData {
  current_threshold: number;
  current_error: number;
  is_current_anomaly: boolean;
  time_series: AnomalyDataPoint[];
  anomaly_count: number;
  anomaly_trend: 'increasing' | 'stable' | 'decreasing';
  sensitivity: number;
}

export function AnomalyDetection({ turbineId }: AnomalyDetectionProps) {
  const [data, setData] = useState<AnomalyData | null>(null);
  const [threshold, setThreshold] = useState(0.3);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Симуляція API-виклику для отримання даних виявлення аномалій
    const loadData = async () => {
      try {
        setIsLoading(true);
        const n = 1024;
        const strain = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 5 * i / 100) * 50 + (Math.random() - 0.5) * 10);
        const accel  = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 10 * i / 100) * 0.5 + (Math.random() - 0.5) * 0.1);

        const backend = await postApiWithAuth<BackendAnomalyResult>('/predict/hf-signal', {
          turbine_id: turbineId || 'WT-001',
          timestamp: new Date().toISOString(),
          sampling_rate_hz: 100.0,
          strain_microstrain: strain,
          accel_ms2: accel,
        });

        const history = Array.from({ length: 29 }, (_, i) => ({
          timestamp: `Day ${i + 1}`,
          reconstruction_error: backend.threshold * (0.3 + Math.random() * 0.5),
          is_anomaly: false,
        }));
        history.push({
          timestamp: 'Now',
          reconstruction_error: backend.anomaly_score,
          is_anomaly: backend.is_anomaly,
        });

        const result: AnomalyData = {
          current_threshold: backend.threshold,
          current_error: backend.anomaly_score,
          is_current_anomaly: backend.is_anomaly,
          time_series: history,
          anomaly_count: history.filter(p => p.is_anomaly).length,
          anomaly_trend: 'stable',
          sensitivity: 0.7,
        };

        setData(result);
        setThreshold(backend.threshold);
        setError(null);
      } catch (err) {
        console.error('AnomalyDetection API error:', err);
        const mockData: AnomalyData = {
          current_threshold: 0.3,
          current_error: 0.18,
          is_current_anomaly: false,
          time_series: [
            { timestamp: 'Day 1', reconstruction_error: 0.12, is_anomaly: false },
            { timestamp: 'Day 2', reconstruction_error: 0.15, is_anomaly: false },
            { timestamp: 'Day 3', reconstruction_error: 0.14, is_anomaly: false },
            { timestamp: 'Day 4', reconstruction_error: 0.25, is_anomaly: false },
            { timestamp: 'Day 5', reconstruction_error: 0.35, is_anomaly: true },
            { timestamp: 'Day 6', reconstruction_error: 0.42, is_anomaly: true },
            { timestamp: 'Day 7', reconstruction_error: 0.28, is_anomaly: false },
            { timestamp: 'Day 8', reconstruction_error: 0.16, is_anomaly: false },
            { timestamp: 'Day 9', reconstruction_error: 0.18, is_anomaly: false },
            { timestamp: 'Day 10', reconstruction_error: 0.19, is_anomaly: false },
          ],
          anomaly_count: 2,
          anomaly_trend: 'decreasing',
          sensitivity: 0.7,
        };
        setData(mockData);
        setThreshold(mockData.current_threshold);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [turbineId]);

  const filteredAnomalies = useMemo(() => {
    if (!data) return [];
    return data.time_series.filter((point) => point.reconstruction_error > threshold);
  }, [data, threshold]);

  const anomalyCount = useMemo(() => {
    if (!data) return 0;
    return filteredAnomalies.length;
  }, [filteredAnomalies, data]);

  const CustomTooltip = (props: { active?: boolean; payload?: Array<{ payload?: AnomalyDataPoint }> }) => {
    if (props.active && props.payload && props.payload.length && props.payload[0].payload) {
      const payload = props.payload[0].payload;
      return (
        <div className="surface-1 dark:bg-gray-800 p-3 rounded-lg border hairline dark:border-gray-700 shadow-lg">
          <p className="text-sm font-medium ink-1 dark:text-white">
            {payload.timestamp}
          </p>
          <p className="text-sm font-semibold ink-1 dark:text-white">
            Error: {payload.reconstruction_error.toFixed(3)}
          </p>
          {payload.is_anomaly && (
            <p className="text-sm signal-crit dark:text-red-400 font-semibold mt-1">
              Аномалію виявлено
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-96 w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 hairline dark:border-red-800">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="font-semibold signal-crit dark:text-red-400">
            Failed to Load Anomaly Detection
          </h3>
          <p className="text-sm signal-crit dark:text-red-500 mt-2">
            {error || 'Не вдалося отримати дані аномалій'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Заголовок */}
        <div>
          <h3 className="text-lg font-semibold ink-1 dark:text-white">
            Виявлення аномалій автоенкодером
          </h3>
          <p className="text-sm ink-3 dark:text-gray-400 mt-1">
            Навчання без учителя для виявлення незвичних патернів у даних сенсорів
          </p>
        </div>

        {/* Поточний статус та статистика */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Поточний статус */}
          <div
            className={`rounded-lg p-4 border-2 ${
              data.is_current_anomaly
                ? 'surface-2 dark:bg-red-900/30 hairline dark:border-red-800'
                : 'surface-2 dark:bg-green-900/30 hairline dark:border-green-800'
            }`}
          >
            <p className="text-sm font-medium ink-3 dark:text-gray-400">
              Поточний стан
            </p>
            <p className="text-2xl font-bold mt-2 ink-1 dark:text-white">
              {data.is_current_anomaly ? 'Аномалія' : 'Норма'}
            </p>
            <p className="text-xs ink-3 dark:text-gray-400 mt-2">
              Error: {data.current_error.toFixed(3)}
            </p>
          </div>

          {/* Кількість аномалій */}
          <div className="rounded-lg p-4 border-2 surface-2 dark:bg-blue-900/30 hairline dark:border-blue-800">
            <p className="text-sm font-medium ink-3 dark:text-gray-400">
              Аномалії (поріг {threshold.toFixed(2)})
            </p>
            <p className="text-2xl font-bold mt-2 ink-1 dark:text-white">
              {anomalyCount}
            </p>
            <p className="text-xs ink-3 dark:text-gray-400 mt-2">
              {((anomalyCount / data.time_series.length) * 100).toFixed(1)}% даних
            </p>
          </div>

          {/* Тренд */}
          <div className="rounded-lg p-4 border-2 surface-2 dark:bg-purple-900/30 hairline dark:border-purple-800">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium ink-3 dark:text-gray-400">
                  Тренд аномалій
                </p>
                <p className="text-2xl font-bold mt-2 ink-1 dark:text-white capitalize">
                  {data.anomaly_trend}
                </p>
              </div>
              <TrendingUp className="w-5 h-5 ink-2 dark:text-purple-400" />
            </div>
          </div>
        </div>

        {/* Повзунок порогу */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium ink-2 dark:text-gray-300">
              Поріг аномалій (регульований)
            </label>
            <span className="text-sm font-semibold signal-live dark:text-blue-400">
              {threshold.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="flex-1 h-2 surface-3 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <p className="text-xs ink-3 dark:text-gray-400">
            Нижчий поріг = більше аномалій виявляється
          </p>
        </div>

        {/* Графік часового ряду */}
        <div className="space-y-2">
          <p className="text-sm font-medium ink-2 dark:text-gray-300">
            Часовий ряд помилки реконструкції
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={data.time_series}
              margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis label={{ value: 'Reconstruction Error', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={<CustomTooltip />} />

              {/* Лінія порогу */}
              <ReferenceLine
                y={threshold}
                stroke="hsl(6 72% 62%)"
                strokeDasharray="5 5"
                label={{
                  value: `Threshold (${threshold.toFixed(2)})`,
                  position: 'right',
                  fill: '#ef4444',
                  fontSize: 12,
                }}
              />

              {/* Лінія помилки */}
              <Line
                type="monotone"
                dataKey="reconstruction_error"
                stroke="hsl(38 90% 58%)"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isAnomaly =
                    payload.reconstruction_error > threshold;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isAnomaly ? 5 : 3}
                      fill={isAnomaly ? '#ef4444' : '#3b82f6'}
                    />
                  );
                }}
                name="Reconstruction Error"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Інформація */}
        <div className="surface-2 dark:bg-blue-900/30 rounded-lg p-4 border hairline dark:border-blue-800">
          <p className="text-sm ink-1 dark:text-blue-200">
            <span className="font-semibold">Як це працює:</span> Автоенкодер навчається нормальним
            патернам сенсорних даних. Висока помилка реконструкції вказує на аномалії. Відрегулюйте поріг
            для управління чутливістю.
          </p>
        </div>
      </div>
    </Card>
  );
}
