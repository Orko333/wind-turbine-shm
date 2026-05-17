'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import { AlertCircle, Play, RotateCcw, Download } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { getApiWithAuth, postApiWithAuth } from '@/lib/api';

interface ROMConfig {
  height: number;
  diameter: number;
  modes: number;
}

interface ROMResults {
  stress: number;
  displacement: number;
  utilization: number;
  safety_status: 'safe' | 'warning' | 'critical';
  max_force_capacity: number;
  natural_frequencies: number[];
  timestamp: string;
}

export function ROMStressAnalysis() {
  const { success, error: showError } = useToast();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [force, setForce] = useState(250);
  const [results, setResults] = useState<ROMResults | null>(null);

  const [config, setConfig] = useState<ROMConfig>({
    height: 80,
    diameter: 4.5,
    modes: 5,
  });

  const maxForceCapacity = useCallback(() => {
    // Розрахунок несучої здатності на основі властивостей башти
    const area = Math.PI * (config.diameter / 2) ** 2;
    const yieldStrength = 355; // МПа для сталі
    return (area * yieldStrength) / 10; // Конвертація в кН
  }, [config.diameter]);

  // Configure ROM on backend (real call)
  const configureROM = useCallback(async () => {
    if (config.height <= 0 || config.diameter <= 0 || config.modes <= 0) {
      showError('Всі параметри мають бути позитивними');
      return;
    }
    try {
      const listRes = await getApiWithAuth<{ data: Array<{ turbine_id: string }> }>('/turbines/?page=1&page_size=1');
      const turbineId = listRes.data?.[0]?.turbine_id;
      if (!turbineId) throw new Error('No turbines available');
      await postApiWithAuth(`/simulation-advanced/rom/configure/${turbineId}`, {
        n_elements: 20,
        n_modes: config.modes,
        height: config.height,
        diameter: config.diameter,
        thickness: 0.05,
        E: 210e9,
        rho: 7850,
      });
      setIsConfigured(true);
      success('ROM налаштовано успішно');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'ROM configure failed');
      console.error(err);
    }
  }, [config, success, showError]);

  // Run real ROM stress analysis on backend
  const runAnalysis = useCallback(async () => {
    setIsRunning(true);
    setProgress(10);

    try {
      const listRes = await getApiWithAuth<{ data: Array<{ turbine_id: string }> }>('/turbines/?page=1&page_size=1');
      const turbineId = listRes.data?.[0]?.turbine_id;
      if (!turbineId) throw new Error('No turbines available');
      setProgress(30);

      interface ROMAnalyzeResult {
        max_stress_mpa: number;
        max_displacement_mm: number;
        safety_factor: number;
        natural_frequencies_hz: number[];
      }
      const backend = await postApiWithAuth<ROMAnalyzeResult>(
        '/simulation-advanced/rom/analyze-stress',
        { turbine_id: turbineId, force_base_kn: force }
      );
      setProgress(80);

      const utilization = (backend.max_stress_mpa / 355) * 100;
      let safetyStatus: 'safe' | 'warning' | 'critical' = 'safe';
      if (utilization > 90) safetyStatus = 'critical';
      else if (utilization > 70) safetyStatus = 'warning';

      setResults({
        stress: backend.max_stress_mpa,
        displacement: backend.max_displacement_mm,
        utilization,
        safety_status: safetyStatus,
        max_force_capacity: maxForceCapacity(),
        natural_frequencies: backend.natural_frequencies_hz ?? [],
        timestamp: new Date().toISOString(),
      });
      setProgress(100);
      success('Аналіз ROM завершено');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Помилка аналізу');
      console.error(err);
      setProgress(0);
    } finally {
      setIsRunning(false);
    }
  }, [force, maxForceCapacity, success, showError]);

  const exportResults = useCallback(() => {
    if (!results) return;

    const exportData = {
      config,
      force,
      results,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rom-analysis-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    success('Результати експортовано');
  }, [results, config, force, success]);

  return (
    <div className="space-y-6">
      {/* Конфігурація */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">ROM Configuration</h3>

        {!isConfigured ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Висота башти */}
              <div>
                <label className="block text-sm font-medium ink-2 mb-2">
                  Tower Height (m)
                </label>
                <input
                  type="number"
                  min="30"
                  max="150"
                  step="1"
                  value={config.height}
                  onChange={(e) =>
                    setConfig({ ...config, height: parseFloat(e.target.value) })
                  }
                  className="w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Діаметр */}
              <div>
                <label className="block text-sm font-medium ink-2 mb-2">
                  Diameter (m)
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  step="0.1"
                  value={config.diameter}
                  onChange={(e) =>
                    setConfig({ ...config, diameter: parseFloat(e.target.value) })
                  }
                  className="w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Моди */}
              <div>
                <label className="block text-sm font-medium ink-2 mb-2">
                  Number of Modes
                </label>
                <select
                  value={config.modes}
                  onChange={(e) =>
                    setConfig({ ...config, modes: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="3">3 modes</option>
                  <option value="5">5 modes</option>
                  <option value="10">10 modes</option>
                  <option value="20">20 modes</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <Button onClick={configureROM} className="w-full md:w-auto">
                Configure ROM Model
              </Button>
            </div>
          </>
        ) : (
          <div className="p-4 surface-2 border hairline rounded-lg">
            <p className="text-sm signal-live">
              <span className="font-semibold">ROM configured:</span> {config.height}m x {config.diameter}m, {config.modes} modes
            </p>
            <p className="text-xs signal-live mt-1">
              Max capacity: {maxForceCapacity().toFixed(0)} kN
            </p>
          </div>
        )}
      </Card>

      {/* Керування силою */}
      {isConfigured && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-6">Applied Load</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium ink-2 mb-2">
                Horizontal Force (kN)
              </label>
              <input
                type="range"
                min="0"
                max={Math.round(maxForceCapacity() * 1.1)}
                step="10"
                value={force}
                onChange={(e) => setForce(parseFloat(e.target.value))}
                disabled={isRunning}
                className="w-full"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-2xl font-bold signal-live">
                  {force.toFixed(0)} kN
                </span>
                <span className="text-sm ink-3">
                  Max: {maxForceCapacity().toFixed(0)} kN
                </span>
              </div>

              {force > maxForceCapacity() && (
                <div className="mt-3 p-3 surface-3 hairline border rounded flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 signal-crit" />
                  <p className="text-sm signal-crit">
                    Force exceeds maximum capacity
                  </p>
                </div>
              )}
            </div>

            {/* Кнопки дій */}
            <div className="flex gap-3">
              <Button
                onClick={runAnalysis}
                disabled={isRunning || force > maxForceCapacity() * 1.2}
                className="flex-1"
              >
                <Play className="w-4 h-4 mr-2" />
                {isRunning ? 'Running...' : 'Run Analysis'}
              </Button>
              <Button
                onClick={() => {
                  setResults(null);
                  setProgress(0);
                  setForce(250);
                }}
                variant="outline"
                disabled={isRunning}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Прогрес */}
      {isRunning && (
        <ProgressBar
          progress={progress}
          isRunning={isRunning}
          label="ROM Stress Analysis"
        />
      )}

      {/* Результати */}
      {results && (
        <Card
          className={`p-6 border-2 ${
            results.safety_status === 'safe'
              ? 'hairline surface-2'
              : results.safety_status === 'warning'
              ? 'hairline surface-2'
              : 'hairline surface-2'
          }`}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold">Analysis Results</h3>
              <p
                className={`text-sm font-medium mt-1 ${
                  results.safety_status === 'safe'
                    ? 'signal-live'
                    : results.safety_status === 'warning'
                    ? 'signal-warn'
                    : 'signal-crit'
                }`}
              >
                Status: {results.safety_status.toUpperCase()}
              </p>
            </div>
            <Button
              onClick={exportResults}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Stress</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.stress.toFixed(1)} MPa
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Displacement</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.displacement.toFixed(2)} mm
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Utilization</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.utilization.toFixed(1)}%
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Safety Factor</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {(results.max_force_capacity / force).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Власні частоти */}
          <div className="p-4 surface-1 border hairline rounded-lg">
            <p className="text-sm font-semibold ink-2 mb-3">
              Natural Frequencies (Hz)
            </p>
            <div className="flex flex-wrap gap-2">
              {results.natural_frequencies.map((freq, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 surface-3 ink-2 text-xs rounded-full font-medium"
                >
                  {freq.toFixed(3)} Hz
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
