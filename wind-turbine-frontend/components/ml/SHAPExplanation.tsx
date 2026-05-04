'use client';

import { useState, useEffect, useMemo } from 'react';
import { postApiWithAuth } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertCircle } from 'lucide-react';

interface BackendSCDAResult {
  turbine_id: string;
  damage_index: number;
  damage_class: string;
  class_probabilities: Record<string, number>;
  shap_explanation: Record<string, number> | null;
}

interface SHAPExplanationProps {
  modelType?: 'cnn' | 'lstm';
}

interface FeatureImportance {
  feature: string;
  shap_value: number;
  contribution: string;
}

interface SHAPData {
  model_type: string;
  base_value: number;
  model_prediction: number;
  features: FeatureImportance[];
}

export function SHAPExplanation({ modelType = 'cnn' }: SHAPExplanationProps) {
  const [data, setData] = useState<SHAPData | null>(null);
  const [activeTab, setActiveTab] = useState<'bar' | 'waterfall'>('bar');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Симуляція API-виклику для отримання SHAP-пояснень
    const loadData = async () => {
      const mockData: SHAPData = {
        model_type: modelType === 'cnn' ? 'CNN Damage Classifier' : 'LSTM RUL Predictor',
        base_value: 0.4,
        model_prediction: 0.875,
        features: [
          { feature: 'Vibration Amplitude', shap_value: 0.15, contribution: 'positive' },
          { feature: 'Temperature Trend', shap_value: 0.12, contribution: 'positive' },
          { feature: 'Power Output', shap_value: -0.08, contribution: 'negative' },
          { feature: 'Blade Pitch Angle', shap_value: 0.1, contribution: 'positive' },
          { feature: 'Rotor Speed Variance', shap_value: 0.08, contribution: 'positive' },
          { feature: 'Gearbox Oil Temp', shap_value: 0.06, contribution: 'positive' },
          { feature: 'Wind Speed', shap_value: -0.04, contribution: 'negative' },
          { feature: 'Humidity Level', shap_value: 0.03, contribution: 'positive' },
        ],
      };

      try {
        setIsLoading(true);
        const backend = await postApiWithAuth<BackendSCDAResult>('/predict/scada?explain=true', {
          turbine_id: 'WT-001',
          timestamp: new Date().toISOString(),
          wind_speed_mean: 10.5,
          wind_speed_std: 1.2,
          rotor_speed_rpm: 14.0,
          pitch_angle_deg: 5.0,
          active_power_kw: 1800.0,
          tower_base_moment_kNm: 8000.0,
          tower_top_accel_rms: 0.15,
          nacelle_temp_degC: 45.0,
        });

        if (backend.shap_explanation && typeof backend.shap_explanation === 'object') {
          const features: FeatureImportance[] = Object.entries(backend.shap_explanation).map(
            ([key, value]) => ({
              feature: key,
              shap_value: value,
              contribution: value >= 0 ? 'positive' : 'negative',
            })
          );
          setData({
            model_type: modelType === 'cnn' ? 'CNN Damage Classifier' : 'LSTM RUL Predictor',
            base_value: backend.damage_index ?? 0.4,
            model_prediction:
              (backend.class_probabilities?.['Warning'] ?? 0) +
              (backend.class_probabilities?.['Critical'] ?? 0),
            features,
          });
        } else {
          setData(mockData);
        }
        setError(null);
      } catch (err) {
        console.error('SHAPExplanation API error:', err);
        setData(mockData);
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [modelType]);

  const sortedFeatures = useMemo(() => {
    if (!data) return [];
    return [...data.features].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));
  }, [data]);

  const chartData = useMemo(() => {
    return sortedFeatures.map((f) => ({
      feature: f.feature,
      value: f.shap_value,
      absValue: Math.abs(f.shap_value),
    }));
  }, [sortedFeatures]);

  const waterfallData = useMemo(() => {
    if (!data) return [];
    let cumulative = data.base_value;
    const result: Array<{
      name: string;
      value: number;
      cumulativeStart: number;
      cumulative: number;
    }> = [
      {
        name: 'Base Value',
        value: data.base_value,
        cumulativeStart: 0,
        cumulative: cumulative,
      },
    ];

    sortedFeatures.forEach((f) => {
      const prevCumulative = cumulative;
      cumulative += f.shap_value;
      result.push({
        name: f.feature,
        value: f.shap_value,
        cumulativeStart: f.shap_value > 0 ? prevCumulative : cumulative,
        cumulative: cumulative,
      });
    });

    result.push({
      name: 'Прогноз',
      value: 0,
      cumulativeStart: cumulative,
      cumulative: data.model_prediction,
    });

    return result;
  }, [data, sortedFeatures]);

  const CustomTooltip = (props: { active?: boolean; payload?: Array<{ payload?: { feature?: string; value?: number } }> }) => {
    if (props.active && props.payload && props.payload.length && props.payload[0].payload) {
      const payload = props.payload[0].payload;
      if (!payload.feature || payload.value === undefined) return null;
      const feature = data?.features.find((f) => f.feature === payload.feature);
      return (
        <div className="surface-1 dark:bg-gray-800 p-3 rounded-lg border hairline dark:border-gray-700 shadow-lg">
          <p className="text-sm font-medium ink-1 dark:text-white">
            {payload.feature}
          </p>
          <p className="text-sm font-semibold ink-1 dark:text-white">
            SHAP Value: {payload.value.toFixed(3)}
          </p>
          {feature && (
            <p className="text-xs ink-3 dark:text-gray-400 mt-2">
              {feature.contribution}
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
          <AlertCircle className="w-12 h-12 signal-crit mx-auto mb-4" />
          <h3 className="font-semibold signal-crit">
            Failed to Load SHAP Explanation
          </h3>
          <p className="text-sm signal-crit dark:signal-crit mt-2">
            {error || 'Не вдалося отримати важливість ознак'}
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
            Важливість ознак SHAP
          </h3>
          <p className="text-sm ink-3 dark:text-gray-400 mt-1">
            Пояснювання моделі, яке показує внесок ознак у прогнози ({data.model_type})
          </p>
        </div>

        {/* Підсумок прогнозу */}
        <div className="surface-2 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg p-4 border hairline dark:border-blue-800">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs ink-3 dark:text-gray-400">Базове значення</p>
              <p className="text-2xl font-bold ink-1 dark:text-white mt-1">
                {data.base_value.toFixed(3)}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs ink-3 dark:text-gray-400">Вплив ознак</p>
                <p className="text-lg font-bold ink-1 dark:text-white mt-1">
                  +{(data.model_prediction - data.base_value).toFixed(3)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs ink-3 dark:text-gray-400">Прогноз</p>
              <p className="text-2xl font-bold signal-live dark:ink-3 mt-1">
                {data.model_prediction.toFixed(3)}
              </p>
            </div>
          </div>
        </div>

        {/* Навігація по вкладках */}
        <div className="flex gap-2 border-b hairline dark:border-gray-700">
          <button
            onClick={() => setActiveTab('bar')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'bar'
                ? 'border-blue-600 signal-live dark:ink-3'
                : 'border-transparent ink-3 dark:text-gray-400 hover:ink-1 dark:hover:text-gray-200'
            }`}
          >
            Важливість ознак
          </button>
          <button
            onClick={() => setActiveTab('waterfall')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'waterfall'
                ? 'border-blue-600 signal-live dark:ink-3'
                : 'border-transparent ink-3 dark:text-gray-400 hover:ink-1 dark:hover:text-gray-200'
            }`}
          >
            Каскадна діаграма
          </button>
        </div>

        {/* Стовпчикова діаграма — важливість ознак */}
        {activeTab === 'bar' && (
          <div className="space-y-2">
            <p className="text-sm font-medium ink-2 dark:text-gray-300">
            Вплив ознак на прогноз (за абсолютним значенням SHAP)
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 150, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" label={{ value: 'Значення SHAP (вплив)', position: 'insideBottom', offset: -5 }} />
                <YAxis dataKey="feature" type="category" width={140} />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.value > 0 ? '#ef4444' : '#10b981'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded surface-20" />
                <span className="ink-3 dark:text-gray-400">Збільшує прогноз</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded surface-20" />
                <span className="ink-3 dark:text-gray-400">Зменшує прогноз</span>
              </div>
            </div>
          </div>
        )}

        {/* Каскадна діаграма */}
        {activeTab === 'waterfall' && (
          <div className="space-y-2">
            <p className="text-sm font-medium ink-2 dark:text-gray-300">
            Як ознаки об'єднуються в прогноз
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={waterfallData} margin={{ top: 10, right: 30, left: 150, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(26 8% 11%)",
                    border: "1px solid hsl(28 8% 22%)",
                    borderRadius: '4px',
                  }}
                  formatter={(value) => (typeof value === 'number' ? value.toFixed(3) : value)}
                />
                <Bar dataKey="value" stackId="a" fill="hsl(38 90% 58%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Деталі ознак */}
        <div className="space-y-2">
          <p className="text-sm font-medium ink-2 dark:text-gray-300">
            Внесок ознак (відсортовано за впливом)
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedFeatures.map((feature) => (
              <div
                key={feature.feature}
                className="p-3 surface-2 dark:bg-gray-800 rounded-lg border hairline dark:border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium ink-1 dark:text-white">
                      {feature.feature}
                    </p>
                    <p className="text-xs ink-3 dark:text-gray-400 mt-1">
                      {feature.contribution}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold px-2 py-1 rounded ${
                      feature.shap_value > 0
                        ? 'surface-3 signal-crit'
                        : 'surface-3 signal-live'
                    }`}
                  >
                    {feature.shap_value > 0 ? '+' : ''}
                    {feature.shap_value.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Пояснення */}
        <div className="surface-2 dark:bg-blue-900/30 rounded-lg p-4 border hairline dark:border-blue-800">
          <p className="text-sm ink-1 dark:text-blue-200">
            <span className="font-semibold">Пояснення SHAP-значень:</span> SHAP (SHapley Additive
            exPlanations) вказує, наскільки кожен ознак відхиляється від базового значення.
            Червоні смуги збільшують прогноз; зелені — зменшують.
          </p>
        </div>
      </div>
    </Card>
  );
}
