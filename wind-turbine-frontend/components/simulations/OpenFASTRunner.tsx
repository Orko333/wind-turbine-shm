'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import { Play, RotateCcw, Download } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface OpenFASTConfig {
  wind_speed: number;
  turbulence: number;
  duration: number;
  timestep: number;
}

interface SimulationResults {
  power: number;
  moment: number;
  frequency: number;
  method: string;
  timestamp: string;
}

export function OpenFASTRunner() {
  const { success, error: showError } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number>();
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [cachedResults, setCachedResults] = useState<Map<string, SimulationResults>>(new Map());

  const [config, setConfig] = useState<OpenFASTConfig>({
    wind_speed: 12,
    turbulence: 0.16,
    duration: 600,
    timestep: 0.025,
  });

  // Генерація ключа кешу з конфігурації
  const cacheKey = useMemo(
    () => JSON.stringify(config),
    [config]
  );

  // Запуск симуляції з кешуванням та резервним методом
  const runSimulation = useCallback(async () => {
    // Спочатку перевірка кешу
    if (cachedResults.has(cacheKey)) {
      const cached = cachedResults.get(cacheKey);
      if (cached) {
        setResults(cached);
        success('Результати завантажено з кешу');
        return;
      }
    }

    setIsRunning(true);
    setProgress(0);
    setEta(Math.ceil(config.duration / 10)); // Грубе оцінювання

    try {
      // Симуляція обчислення OpenFAST з оновленням прогресу
      const totalSteps = Math.ceil(config.duration / config.timestep);
      let currentStep = 0;

      const progressInterval = setInterval(() => {
        currentStep += totalSteps * 0.15;
        if (currentStep > totalSteps) currentStep = totalSteps;

        const progressPct = (currentStep / totalSteps) * 100;
        setProgress(progressPct);
        setEta((prev) => (prev && prev > 0 ? prev - 1 : undefined));

        if (currentStep >= totalSteps) {
          clearInterval(progressInterval);
        }
      }, 500);

      // Симуляція API-виклику
      await new Promise((resolve) => setTimeout(resolve, 3000));
      clearInterval(progressInterval);

      // Спершу спроба основного методу (інколи симулюємо невдачу)
      const useFallback = Math.random() > 0.7;

      const simulationResults: SimulationResults = {
        power: (() => {
          const baselineEfficiency = 0.45;
          const windEfficiency = Math.min((config.wind_speed / 15) * baselineEfficiency, baselineEfficiency);
          return (windEfficiency * config.wind_speed ** 3 * 0.5) / 1000; // МВт
        })(),
        moment: (() => {
          return config.wind_speed * 450 + Math.random() * 100; // Нм
        })(),
        frequency: 1.2 + (config.wind_speed / 20) * 0.3, // Гц
        method: useFallback ? 'BEM (Fallback)' : 'OpenFAST Primary',
        timestamp: new Date().toISOString(),
      };

      // Кешування результатів
      const newCache = new Map(cachedResults);
      newCache.set(cacheKey, simulationResults);
      setCachedResults(newCache);

      setResults(simulationResults);
      setProgress(100);
      success(`Simulation completed using ${simulationResults.method}`);
    } catch (err) {
      showError('Помилка симуляції — перевірте параметри');
      console.error(err);
      setProgress(0);
    } finally {
      setIsRunning(false);
    }
  }, [config, cachedResults, cacheKey, success, showError]);

  const resetSimulation = useCallback(() => {
    setResults(null);
    setProgress(0);
    setEta(undefined);
  }, []);

  const exportResults = useCallback(() => {
    if (!results) return;

    const exportData = {
      config,
      results,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openfast-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    success('Результати експортовано');
  }, [results, config, success]);

  return (
    <div className="space-y-6">
      {/* Панель конфігурації */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">OpenFAST Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Швидкість вітру */}
          <div>
            <label className="block text-sm font-medium ink-2 mb-2">
              Wind Speed (m/s)
            </label>
            <input
              type="range"
              min="5"
              max="25"
              step="0.5"
              value={config.wind_speed}
              onChange={(e) =>
                setConfig({ ...config, wind_speed: parseFloat(e.target.value) })
              }
              disabled={isRunning}
              className="w-full"
            />
            <div className="mt-2 text-sm ink-3">
              <span className="font-semibold text-lg signal-live">
                {config.wind_speed.toFixed(1)} m/s
              </span>
              <p className="text-xs mt-1">
                {config.wind_speed < 5 && 'Нижче порога вмикання'}
                {config.wind_speed >= 5 && config.wind_speed < 12 && 'Слабкий вітер'}
                {config.wind_speed >= 12 && config.wind_speed < 20 && 'Оптимальна робота'}
                {config.wind_speed >= 20 && 'Сильний вітер'}
              </p>
            </div>
          </div>

          {/* Інтенсивність турбулентності */}
          <div>
            <label className="block text-sm font-medium ink-2 mb-2">
              Turbulence Intensity
            </label>
            <input
              type="range"
              min="0.08"
              max="0.25"
              step="0.01"
              value={config.turbulence}
              onChange={(e) =>
                setConfig({ ...config, turbulence: parseFloat(e.target.value) })
              }
              disabled={isRunning}
              className="w-full"
            />
            <div className="mt-2 text-sm ink-3">
              <span className="font-semibold text-lg signal-live">
                {(config.turbulence * 100).toFixed(1)}%
              </span>
              <p className="text-xs mt-1">
                {config.turbulence < 0.12 && 'Низька турбулентність (офшор)'}
                {config.turbulence >= 0.12 && config.turbulence < 0.18 && 'Помірна турбулентність'}
                {config.turbulence >= 0.18 && 'Висока турбулентність (на суші)'}
              </p>
            </div>
          </div>

          {/* Тривалість */}
          <div>
            <label className="block text-sm font-medium ink-2 mb-2">
              Тривалість симуляції (секунди)
            </label>
            <input
              type="number"
              min="60"
              max="3600"
              step="60"
              value={config.duration}
              onChange={(e) =>
                setConfig({ ...config, duration: parseFloat(e.target.value) })
              }
              disabled={isRunning}
              className="w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="mt-2 text-sm ink-3">
              {(config.duration / 60).toFixed(1)} minutes
            </div>
          </div>

          {/* Часовий крок */}
          <div>
            <label className="block text-sm font-medium ink-2 mb-2">
              Крок часу (секунди)
            </label>
            <select
              value={config.timestep}
              onChange={(e) =>
                setConfig({ ...config, timestep: parseFloat(e.target.value) })
              }
              disabled={isRunning}
              className="w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="0.005">0.005s (200 Hz)</option>
              <option value="0.0125">0.0125s (80 Hz)</option>
              <option value="0.025">0.025s (40 Hz)</option>
              <option value="0.05">0.05s (20 Hz)</option>
            </select>
            <div className="mt-2 text-sm ink-3">
              ~{Math.ceil(config.duration / config.timestep).toLocaleString()} timesteps
            </div>
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="mt-6 flex gap-3">
          <Button
            onClick={runSimulation}
            disabled={isRunning}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Simulation'}
          </Button>
          <Button
            onClick={resetSimulation}
            variant="outline"
            disabled={isRunning}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </Card>

      {/* Індикатор прогресу */}
      {isRunning && (
        <ProgressBar
          progress={progress}
          isRunning={isRunning}
          eta={eta}
          label="OpenFAST Simulation"
        />
      )}

      {/* Результати */}
      {results && (
        <Card className="p-6 hairline surface-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold signal-live">
              Simulation Results
            </h3>
            <Button
              onClick={exportResults}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Power Output</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.power.toFixed(2)} MW
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Rotor Moment</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {(results.moment / 1000).toFixed(2)} MNm
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Frequency</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.frequency.toFixed(2)} Hz
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Method</p>
              <p className="text-sm font-semibold signal-live mt-2">
                {results.method}
              </p>
              <p className="text-xs ink-3 mt-1">
                {new Date(results.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Індикатор кешу */}
          <div className="mt-4 p-3 surface-1 rounded border hairline">
            <p className="text-xs ink-3">
              Cached results available: <span className="font-semibold">{cachedResults.size}</span>
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
