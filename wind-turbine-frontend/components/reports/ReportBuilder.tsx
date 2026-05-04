'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '../../hooks/useToast';
import { X, Download } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

interface ReportMetric {
  id: string;
  name: string;
  type: 'scalar' | 'timeseries' | 'distribution';
}

interface ReportConfig {
  id?: string;
  title: string;
  description: string;
  metrics: ReportMetric[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  turbineIds: string[];
  reportType: 'summary' | 'detailed' | 'trend';
}

const METRIC_NAMES = {
  en: {
    power_output: 'Power Output',
    efficiency: 'Efficiency',
    availability: 'Availability',
    damage_index: 'Cumulative Damage',
    rul: 'Remaining Useful Life',
    vibration: 'Vibration Amplitude',
    wind_speed: 'Wind Speed',
    temperature: 'Temperature',
    frequency_distribution: 'Frequency Distribution',
    load_distribution: 'Load Distribution',
  },
  uk: {
    power_output: 'Вихідна потужність',
    efficiency: 'Ефективність',
    availability: 'Доступність',
    damage_index: 'Накопичене пошкодження',
    rul: 'Залишковий ресурс',
    vibration: 'Амплітуда вібрації',
    wind_speed: 'Швидкість вітру',
    temperature: 'Температура',
    frequency_distribution: 'Розподіл частот',
    load_distribution: 'Розподіл навантаження',
  },
} as const;

const UI_TEXT = {
  en: {
    defaultTitle: 'Wind Farm Performance Report',
    defaultDescription: 'Comprehensive analysis of turbine performance',
    metricRequired: 'Please select at least one metric',
    reportGenerated: 'generated successfully',
    reportGenerateFailed: 'Failed to generate report',
    reportExported: 'Report exported successfully',
    reportExportFailed: 'Failed to export report',
    reportConfig: 'Report Configuration',
    reportTitle: 'Report Title',
    reportType: 'Report Type',
    summaryReport: 'Summary Report',
    detailedReport: 'Detailed Report',
    trendAnalysis: 'Trend Analysis',
    description: 'Description',
    startDate: 'Start Date',
    endDate: 'End Date',
    selectedMetrics: 'Selected Metrics',
    clearAll: 'Clear All',
    noMetrics: 'No metrics selected. Choose from the list below.',
    availableMetrics: 'Available Metrics',
    export: 'Export',
    generating: 'Generating...',
    generateReport: 'Generate Report',
    reportTypes: 'Report Types',
    titlePlaceholder: 'Enter report title',
    descriptionPlaceholder: 'Enter report description',
  },
  uk: {
    defaultTitle: 'Звіт продуктивності вітропарку',
    defaultDescription: 'Комплексний аналіз продуктивності турбін',
    metricRequired: 'Оберіть щонайменше один показник',
    reportGenerated: 'успішно згенеровано',
    reportGenerateFailed: 'Не вдалося згенерувати звіт',
    reportExported: 'Звіт успішно експортовано',
    reportExportFailed: 'Не вдалося експортувати звіт',
    reportConfig: 'Конфігурація звіту',
    reportTitle: 'Назва звіту',
    reportType: 'Тип звіту',
    summaryReport: 'Зведений звіт',
    detailedReport: 'Детальний звіт',
    trendAnalysis: 'Аналіз трендів',
    description: 'Опис',
    startDate: 'Дата початку',
    endDate: 'Дата завершення',
    selectedMetrics: 'Обрані показники',
    clearAll: 'Очистити',
    noMetrics: 'Показники не вибрано. Оберіть зі списку нижче.',
    availableMetrics: 'Доступні показники',
    export: 'Експорт',
    generating: 'Генерація...',
    generateReport: 'Згенерувати звіт',
    reportTypes: 'Типи звітів',
    titlePlaceholder: 'Введіть назву звіту',
    descriptionPlaceholder: 'Введіть опис звіту',
  },
} as const;

const availableMetrics: ReportMetric[] = [
  { id: 'power_output', name: METRIC_NAMES.en.power_output, type: 'timeseries' },
  { id: 'efficiency', name: METRIC_NAMES.en.efficiency, type: 'scalar' },
  { id: 'availability', name: METRIC_NAMES.en.availability, type: 'scalar' },
  { id: 'damage_index', name: METRIC_NAMES.en.damage_index, type: 'timeseries' },
  { id: 'rul', name: METRIC_NAMES.en.rul, type: 'scalar' },
  { id: 'vibration', name: METRIC_NAMES.en.vibration, type: 'timeseries' },
  { id: 'wind_speed', name: METRIC_NAMES.en.wind_speed, type: 'timeseries' },
  { id: 'temperature', name: METRIC_NAMES.en.temperature, type: 'timeseries' },
  { id: 'frequency_distribution', name: METRIC_NAMES.en.frequency_distribution, type: 'distribution' },
  { id: 'load_distribution', name: METRIC_NAMES.en.load_distribution, type: 'distribution' },
];

export function ReportBuilder() {
  const { success, error: showError } = useToast();
  const { locale } = useLocale();
  const L = UI_TEXT[locale];
  const metricNames = METRIC_NAMES[locale];
  const [isGenerating, setIsGenerating] = useState(false);
  const [config, setConfig] = useState<ReportConfig>({
    title: L.defaultTitle,
    description: L.defaultDescription,
    metrics: [availableMetrics[0], availableMetrics[1]],
    dateRange: {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    },
    turbineIds: [],
    reportType: 'summary',
  });

  const handleAddMetric = useCallback((metric: ReportMetric) => {
    setConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.some((m) => m.id === metric.id)
        ? prev.metrics
        : [...prev.metrics, metric],
    }));
  }, []);

  const handleRemoveMetric = useCallback((metricId: string) => {
    setConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.filter((m) => m.id !== metricId),
    }));
  }, []);

  const handleInputChange = useCallback(
    (field: string, value: string) => {
      setConfig((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleGenerateReport = useCallback(() => {
    if (config.metrics.length === 0) {
      showError(L.metricRequired);
      return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      success(`"${config.title}" ${L.reportGenerated}`);
      setIsGenerating(false);
    }, 600);
  }, [config, success, showError, L.metricRequired, L.reportGenerated]);

  const handleExportReport = useCallback(() => {
    setIsGenerating(true);
    setTimeout(() => {
      success(L.reportExported);
      setIsGenerating(false);
    }, 400);
  }, [success, L.reportExported]);

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">{L.reportConfig}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium">{L.reportTitle}</label>
            <Input
              value={config.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder={L.titlePlaceholder}
              className="mt-2"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium">{L.reportType}</label>
            <select
              value={config.reportType}
              onChange={(e) => handleInputChange('reportType', e.target.value)}
              className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="summary">{L.summaryReport}</option>
              <option value="detailed">{L.detailedReport}</option>
              <option value="trend">{L.trendAnalysis}</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="text-sm font-medium">{L.description}</label>
          <textarea
            value={config.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder={L.descriptionPlaceholder}
            className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
            rows={3}
          />
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">{L.startDate}</label>
            <Input
              type="date"
              value={config.dateRange.startDate}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  dateRange: { ...prev.dateRange, startDate: e.target.value },
                }))
              }
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{L.endDate}</label>
            <Input
              type="date"
              value={config.dateRange.endDate}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  dateRange: { ...prev.dateRange, endDate: e.target.value },
                }))
              }
              className="mt-2"
            />
          </div>
        </div>
      </Card>

      {/* Metrics Selection */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{L.selectedMetrics} ({config.metrics.length})</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfig((prev) => ({ ...prev, metrics: [] }))}
            disabled={config.metrics.length === 0}
          >
            {L.clearAll}
          </Button>
        </div>

        <div className="space-y-2 mb-6">
          {config.metrics.length === 0 ? (
            <p className="text-sm ink-3 py-4">{L.noMetrics}</p>
          ) : (
            config.metrics.map((metric) => (
              <div
                key={metric.id}
                className="flex items-center justify-between p-3 surface-2 border hairline rounded-lg"
              >
                <div>
                  <p className="font-medium text-sm">{metricNames[metric.id as keyof typeof metricNames]}</p>
                  <p className="text-xs ink-3 capitalize">{metric.type}</p>
                </div>
                <button
                  onClick={() => handleRemoveMetric(metric.id)}
                  className="signal-crit hover:signal-crit"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Available Metrics Grid */}
        <div className="mb-4">
          <p className="text-sm font-medium mb-3">{L.availableMetrics}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {availableMetrics.map((metric) => (
              <button
                key={metric.id}
                onClick={() => handleAddMetric(metric)}
                disabled={config.metrics.some((m) => m.id === metric.id)}
                className={`p-2 rounded-lg border hairline text-xs text-left transition-colors ${
                  config.metrics.some((m) => m.id === metric.id)
                    ? 'surface-3 ink-3 opacity-50 cursor-not-allowed'
                    : 'surface-1 ink-2 hover:surface-2'
                }`}
              >
                <div className="font-medium">{metricNames[metric.id as keyof typeof metricNames]}</div>
                <div className="text-xs ink-3 capitalize">{metric.type}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={handleExportReport}
          disabled={isGenerating || !config.id}
        >
          <Download className="w-4 h-4 mr-2" />
          {L.export}
        </Button>
        <Button
          onClick={handleGenerateReport}
          disabled={isGenerating || config.metrics.length === 0}
        >
          {isGenerating ? L.generating : L.generateReport}
        </Button>
      </div>

      {/* Information */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">{L.reportTypes}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="font-medium mb-2">{L.summaryReport}</p>
            <p className="text-muted-foreground text-xs">
              {locale === 'uk'
                ? 'Огляд ключових показників, трендів та рекомендацій за вибраний період.'
                : 'High-level overview with key metrics, trends, and recommendations for the selected period.'}
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">{L.detailedReport}</p>
            <p className="text-muted-foreground text-xs">
              {locale === 'uk'
                ? 'Поглиблений аналіз з графіками, таблицями, статистикою та результатами виявлення аномалій.'
                : 'In-depth analysis including charts, tables, statistical analysis, and anomaly detection results.'}
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">{L.trendAnalysis}</p>
            <p className="text-muted-foreground text-xs">
              {locale === 'uk'
                ? 'Довгострокові тренди із сезонними патернами, кривими деградації та прогнозом залишкового ресурсу.'
                : 'Long-term trends showing seasonal patterns, degradation curves, and predictive insights for RUL.'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
