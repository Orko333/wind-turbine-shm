'use client';

import { useState, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import { Upload, Play, RotateCcw, Download, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface DynamicResults {
  max_stress: number;
  cumulative_damage: number;
  rul_years: number;
  peak_wind: number;
  avg_wind: number;
  simulation_time: number;
  timestamp: string;
}

interface WindData {
  data: number[];
  filename: string;
  validationErrors: string[];
}

export function DynamicSimulation() {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [windData, setWindData] = useState<WindData | null>(null);
  const [results, setResults] = useState<DynamicResults | null>(null);

  // Парсинг та валідація CSV-файлу
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const lines = content.trim().split('\n');
          const errors: string[] = [];

          // Парсинг CSV
          const data: number[] = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;

            const value = parseFloat(line);
            if (isNaN(value)) {
              errors.push(`Line ${i + 1}: Invalid number "${line}"`);
              continue;
            }

            if (value < 0 || value > 30) {
              errors.push(`Line ${i + 1}: Wind speed out of range (${value} m/s)`);
              continue;
            }

            data.push(value);
          }

          if (data.length === 0) {
            showError('Не знайдено даних швидкості вітру');
            return;
          }

          if (data.length < 100) {
            errors.push(`Warning: Only ${data.length} data points (recommended min 100)`);
          }

          setWindData({
            data,
            filename: file.name,
            validationErrors: errors,
          });

          if (errors.length === 0) {
            success(`Loaded ${data.length} wind speed values`);
          } else {
            showError(`${errors.length} validation issues found`);
          }
        } catch (err) {
          showError('Не вдалося розібрати CSV-файл');
          console.error(err);
        }
      };

      reader.readAsText(file);
    },
    [success, showError]
  );

  // Запуск динамічної симуляції
  const runSimulation = useCallback(async () => {
    if (!windData) {
      showError('Спочатку завантажте дані вітру');
      return;
    }

    setIsRunning(true);
    setProgress(0);

    try {
      const totalSteps = windData.data.length;
      let currentStep = 0;

      // Симуляція обчислення з оновленням прогресу
      const progressInterval = setInterval(() => {
        currentStep = Math.min(currentStep + totalSteps * 0.1, totalSteps);
        const progressPct = (currentStep / totalSteps) * 100;
        setProgress(progressPct);

        if (currentStep >= totalSteps) {
          clearInterval(progressInterval);
        }
      }, 300);

      // Симуляція API-виклику
      await new Promise((resolve) => setTimeout(resolve, 3500));
      clearInterval(progressInterval);

      // Розрахунок результатів за даними вітру
      const maxWind = Math.max(...windData.data);
      const avgWind = windData.data.reduce((a, b) => a + b, 0) / windData.data.length;
      const variance = windData.data.reduce((sum, v) => sum + (v - avgWind) ** 2, 0) / windData.data.length;

      // Симуляція розрахунку напружень та пошкоджень
      const baseStress = 150; // МПа базове значення
      const stressVariability = Math.sqrt(variance) * 20;
      const maxStress = baseStress + stressVariability + (maxWind - 12) * 15;

      // Спрощений розрахунок пошкоджень (на основі S-N кривої)
      const damagePerCycle = windData.data.map((ws) => {
        const stressAmp = 100 + (ws - 12) * 10;
        return Math.pow(stressAmp / 300, 3); // Експонента S-N кривої ~3
      });
      const cumulativeDamage = damagePerCycle.reduce((a, b) => a + b, 0);
      const rulYears = Math.max(0.1, 20 / (cumulativeDamage + 0.1)); // RUL у роках

      const simulationResults: DynamicResults = {
        max_stress: maxStress,
        cumulative_damage: cumulativeDamage,
        rul_years: rulYears,
        peak_wind: maxWind,
        avg_wind: avgWind,
        simulation_time: windData.data.length * 0.1, // секунди
        timestamp: new Date().toISOString(),
      };

      setResults(simulationResults);
      setProgress(100);
      success('Динамічну симуляцію завершено');
    } catch (err) {
      showError('Симуляцію не вдалося виконати');
      console.error(err);
      setProgress(0);
    } finally {
      setIsRunning(false);
    }
  }, [windData, success, showError]);

  const resetSimulation = useCallback(() => {
    setWindData(null);
    setResults(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const exportResults = useCallback(() => {
    if (!results || !windData) return;

    const exportData = {
      filename: windData.filename,
      data_points: windData.data.length,
      results,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dynamic-simulation-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    success('Результати експортовано');
  }, [results, windData, success]);

  return (
    <div className="space-y-6">
      {/* Завантаження файлу */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">Wind Speed Data</h3>

        <div className="space-y-4">
          {!windData ? (
            <>
              <div className="border-2 border-dashed hairline rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm ink-3 mb-4">
                  Upload a CSV file with wind speed measurements (one value per line)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
              </div>

              {/* Інформація про приклад даних */}
              <div className="p-4 surface-2 border hairline rounded-lg">
                <p className="text-sm ink-1 font-medium mb-2">
                  CSV Format Example:
                </p>
                <pre className="text-xs ink-2 surface-1 p-2 rounded border hairline overflow-x-auto">
{`# Wind speeds in m/s
12.5
13.2
11.8
12.9
14.1
...`}
                </pre>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 surface-2 border hairline rounded-lg">
                <p className="text-sm signal-live font-semibold">
                  File: {windData.filename}
                </p>
                <p className="text-sm signal-live mt-1">
                  Data points: {windData.data.length}
                </p>
                <div className="text-xs ink-3 mt-2 flex gap-4">
                  <span>Мін: {Math.min(...windData.data).toFixed(2)} м/с</span>
                  <span>Макс: {Math.max(...windData.data).toFixed(2)} м/с</span>
                  <span>
                    Avg: {(windData.data.reduce((a, b) => a + b, 0) / windData.data.length).toFixed(2)} m/s
                  </span>
                </div>
              </div>

              {/* Помилки валідації */}
              {windData.validationErrors.length > 0 && (
                <div className="p-4 surface-2 border hairline rounded-lg">
                  <div className="flex gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 signal-warn flex-shrink-0 mt-0.5" />
                    <p className="text-sm signal-warn font-medium">
                      {windData.validationErrors.length} проблем(и) валідації
                    </p>
                  </div>
                  <ul className="text-xs signal-warn space-y-1 ml-6">
                    {windData.validationErrors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={resetSimulation}
                  variant="outline"
                  disabled={isRunning}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Змінити файл
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Елементи керування симуляцією */}
      {windData && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-6">Запустити симуляцію</h3>

          <div className="flex gap-3">
            <Button
              onClick={runSimulation}
              disabled={isRunning}
              className="flex-1"
            >
              <Play className="w-4 h-4 mr-2" />
              {isRunning ? 'Симуляція...' : 'Запустити динамічну симуляцію'}
            </Button>
          </div>
        </Card>
      )}

      {/* Прогрес */}
      {isRunning && (
        <ProgressBar
          progress={progress}
          isRunning={isRunning}
          label="Dynamic Simulation"
        />
      )}

      {/* Результати */}
      {results && (
        <Card className="p-6 hairline surface-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold signal-live">
              Результати симуляції
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

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Максимальне напруження</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.max_stress.toFixed(1)} MPa
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Накопичене пошкодження</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {(results.cumulative_damage * 100).toFixed(2)} %
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">RUL</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.rul_years.toFixed(1)} yr
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Піковий вітер</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.peak_wind.toFixed(1)} m/s
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Середній вітер</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.avg_wind.toFixed(1)} m/s
              </p>
            </div>

            <div className="surface-1 p-4 rounded-lg border hairline">
              <p className="text-xs ink-3 font-medium">Час симуляції</p>
              <p className="text-2xl font-bold signal-live mt-2">
                {results.simulation_time.toFixed(1)} s
              </p>
            </div>
          </div>

          {/* Оцінка стану */}
          <div className="p-4 surface-1 border hairline rounded-lg">
            <p className="text-sm font-semibold ink-2 mb-3">
              Оцінка стану
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="ink-3">Рівень напруження:</span>
                <span className={`font-semibold ${results.max_stress > 250 ? 'signal-crit' : 'signal-live'}`}>
                  {results.max_stress > 250 ? 'Критично' : results.max_stress > 200 ? 'Увага' : 'Норма'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="ink-3">Очікуваний ресурс:</span>
                <span className={`font-semibold ${results.rul_years < 2 ? 'signal-crit' : results.rul_years < 5 ? 'signal-warn' : 'signal-live'}`}>
                  {results.rul_years.toFixed(1)} років
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="ink-3">Швидкість деградації:</span>
                <span className="font-semibold signal-live">
                  {(results.cumulative_damage / results.simulation_time).toFixed(4)}/sec
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
