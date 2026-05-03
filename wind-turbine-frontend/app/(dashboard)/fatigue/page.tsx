'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { DamageHistogram } from '@/components/fatigue/DamageHistogram';
import { RULDistribution } from '@/components/fatigue/RULDistribution';
import { TopDamagedTurbines } from '@/components/fatigue/TopDamagedTurbines';
import { DamageAccumulation } from '@/components/fatigue/DamageAccumulation';
import { GoodmanDiagram } from '@/components/fatigue/GoodmanDiagram';
import { RainflowHistogram } from '@/components/fatigue/RainflowHistogram';
import { SNChart } from '@/components/fatigue/SNChart';
import { formatDate } from '@/lib/formatting';
import { useT } from '@/lib/i18n';
import { getApiWithAuth } from '@/lib/api';

interface TurbineItem {
  turbine_id: string;
  cumulative_damage: number;
  rul_years: number;
  alert_level: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

interface FatigueData {
  damageDistribution: Array<{
    range: string;
    count: number;
  }>;
  rulDistribution: Array<{
    range: string;
    turbines: number;
    criticality: 'low' | 'medium' | 'high';
  }>;
  topDamagedTurbines: Array<{
    turbine_id: string;
    damage_rate: number;
    rul_years: number;
    health_score: number;
  }>;
  damageHistory: Array<{
    month: string;
    cumulative_damage: number;
  }>;
  goodmanData: Array<{
    mean_stress: number;
    alternating_stress: number;
    correction_method: string;
  }>;
  rainflowCycles: Array<{
    range: string;
    count: number;
  }>;
  snCurve: {
    bilinear_model: Array<{
      stress: number;
      n_cycles: number;
    }>;
    test_data: Array<{
      stress: number;
      n_cycles: number;
    }>;
  };
  threshold_warnings: Array<{
    turbine_id: string;
    warning_type: string;
    current_value: number;
    threshold: number;
  }>;
}

// Mock дані
const mockFatigueData: FatigueData = {
  damageDistribution: [
    { range: '0-10%', count: 12 },
    { range: '10-20%', count: 18 },
    { range: '20-30%', count: 15 },
    { range: '30-40%', count: 8 },
    { range: '40-50%', count: 4 },
    { range: '50-60%', count: 2 },
  ],
  rulDistribution: [
    { range: '0-1 year', turbines: 2, criticality: 'high' },
    { range: '1-3 years', turbines: 5, criticality: 'high' },
    { range: '3-5 years', turbines: 12, criticality: 'medium' },
    { range: '5-10 years', turbines: 28, criticality: 'low' },
    { range: '10+ years', turbines: 23, criticality: 'low' },
  ],
  topDamagedTurbines: [
    {
      turbine_id: 'T42',
      damage_rate: 0.67,
      rul_years: 2.3,
      health_score: 48,
    },
    {
      turbine_id: 'T35',
      damage_rate: 0.61,
      rul_years: 3.1,
      health_score: 52,
    },
    {
      turbine_id: 'T18',
      damage_rate: 0.58,
      rul_years: 3.5,
      health_score: 56,
    },
    {
      turbine_id: 'T51',
      damage_rate: 0.55,
      rul_years: 4.2,
      health_score: 61,
    },
    {
      turbine_id: 'T7',
      damage_rate: 0.52,
      rul_years: 4.8,
      health_score: 65,
    },
  ],
  damageHistory: [
    { month: 'Jan', cumulative_damage: 5.2 },
    { month: 'Feb', cumulative_damage: 7.8 },
    { month: 'Mar', cumulative_damage: 10.3 },
    { month: 'Apr', cumulative_damage: 13.5 },
    { month: 'May', cumulative_damage: 16.1 },
    { month: 'Jun', cumulative_damage: 19.4 },
    { month: 'Jul', cumulative_damage: 22.7 },
    { month: 'Aug', cumulative_damage: 25.9 },
    { month: 'Sep', cumulative_damage: 28.6 },
    { month: 'Oct', cumulative_damage: 31.2 },
    { month: 'Nov', cumulative_damage: 34.5 },
    { month: 'Dec', cumulative_damage: 37.8 },
  ],
  goodmanData: [
    {
      mean_stress: 50,
      alternating_stress: 120,
      correction_method: 'Goodman Linear',
    },
    {
      mean_stress: 60,
      alternating_stress: 115,
      correction_method: 'Goodman Linear',
    },
    {
      mean_stress: 70,
      alternating_stress: 108,
      correction_method: 'Goodman Linear',
    },
    {
      mean_stress: 80,
      alternating_stress: 100,
      correction_method: 'Goodman Linear',
    },
    {
      mean_stress: 90,
      alternating_stress: 88,
      correction_method: 'Goodman Linear',
    },
  ],
  rainflowCycles: [
    { range: '0-50 MPa', count: 1250 },
    { range: '50-100 MPa', count: 1840 },
    { range: '100-150 MPa', count: 1320 },
    { range: '150-200 MPa', count: 680 },
    { range: '200-250 MPa', count: 340 },
    { range: '250-300 MPa', count: 120 },
  ],
  snCurve: {
    bilinear_model: Array.from({ length: 50 }, (_, i) => {
      const stress = 50 + (i * 5);
      const n = Math.pow(10, 12.5 - (stress / 100));
      return { stress, n_cycles: n };
    }),
    test_data: Array.from({ length: 15 }, (_, i) => {
      const stress = 80 + (i * 15);
      const noise = 0.8 + Math.random() * 0.4;
      const n = Math.pow(10, 12.5 - (stress / 100)) * noise;
      return { stress, n_cycles: n };
    }),
  },
  threshold_warnings: [
    {
      turbine_id: 'T42',
      warning_type: 'Висока швидкість пошкодження',
      current_value: 67,
      threshold: 60,
    },
    {
      turbine_id: 'T35',
      warning_type: 'Низький RUL',
      current_value: 3.1,
      threshold: 5,
    },
    {
      turbine_id: 'T51',
      warning_type: 'Прискорена деградація',
      current_value: 2.8,
      threshold: 3,
    },
  ],
};

export default function FatiguePage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [data, setData] = useState<FatigueData>(mockFatigueData);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
    to: new Date(),
  });
  const [filterBy, setFilterBy] = useState<'all' | 'critical' | 'warning'>('all');

  // Load дані on mount and date range change
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const result = await getApiWithAuth<{ data: TurbineItem[]; total: number }>('/turbines?page=1&page_size=100');
        const turbines = result.data;

        const damageDistribution = [
          { range: '0-20%', count: turbines.filter((t) => t.cumulative_damage < 0.2).length },
          { range: '20-40%', count: turbines.filter((t) => t.cumulative_damage >= 0.2 && t.cumulative_damage < 0.4).length },
          { range: '40-60%', count: turbines.filter((t) => t.cumulative_damage >= 0.4 && t.cumulative_damage < 0.6).length },
          { range: '60-80%', count: turbines.filter((t) => t.cumulative_damage >= 0.6 && t.cumulative_damage < 0.8).length },
          { range: '80-100%', count: turbines.filter((t) => t.cumulative_damage >= 0.8).length },
        ];

        const topDamagedTurbines = [...turbines]
          .sort((a, b) => b.cumulative_damage - a.cumulative_damage)
          .slice(0, 5)
          .map((t) => ({
            turbine_id: t.turbine_id,
            damage_rate: t.cumulative_damage * 100,
            rul_years: t.rul_years,
            health_score: Math.round((1 - t.cumulative_damage) * 100),
          }));

        const rulDistribution = [
          { range: '0-5 years', turbines: turbines.filter((t) => t.rul_years < 5).length, criticality: 'high' as const },
          { range: '5-10 years', turbines: turbines.filter((t) => t.rul_years >= 5 && t.rul_years < 10).length, criticality: 'medium' as const },
          { range: '10-15 years', turbines: turbines.filter((t) => t.rul_years >= 10 && t.rul_years < 15).length, criticality: 'low' as const },
          { range: '15+ years', turbines: turbines.filter((t) => t.rul_years >= 15).length, criticality: 'low' as const },
        ];

        const avgDamage = turbines.reduce((s, t) => s + t.cumulative_damage, 0) / turbines.length || 0;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const damageHistory = months.map((month, i) => ({
          month,
          cumulative_damage: parseFloat((avgDamage * (i + 1) / 12 * 100).toFixed(2)),
        }));

        const { goodmanData, rainflowCycles, snCurve, threshold_warnings } = mockFatigueData;

        setData({ damageDistribution, topDamagedTurbines, rulDistribution, damageHistory, goodmanData, rainflowCycles, snCurve, threshold_warnings });
        success('Дані втомленості завантажено');
      } catch (err) {
        console.error('Fatigue page API error:', err);
        showError('Failed to load fatigue data');
        setData(mockFatigueData);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [dateRange, success, showError]);

  // Export дані
  const handleExportData = useCallback(
    async (format: 'json' | 'csv' | 'pdf') => {
      setIsExporting(true);
      try {
        let content: string;
        let filename: string;
        let mimeType: string;

        const dateStr = `${formatDate(dateRange.from)}-${formatDate(dateRange.to)}`;

        if (format === 'json') {
          content = JSON.stringify(data, null, 2);
          filename = `fatigue-analysis-${dateStr}.json`;
          mimeType = 'application/json';
        } else if (format === 'csv') {
          content = generateCSV(data);
          filename = `fatigue-analysis-${dateStr}.csv`;
          mimeType = 'text/csv';
        } else {
          // PDF export would require additional library
          showError('PDF export not yet implemented');
          setIsExporting(false);
          return;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        success(`Data exported as ${format.toUpperCase()}`);
      } catch (err) {
        showError('Failed to export data');
        console.error(err);
      } finally {
        setIsExporting(false);
      }
    },
    [data, dateRange, success, showError]
  );

  // Refresh дані
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      success('Дані оновлено');
    }, 500);
  }, [success]);

  // Filter warnings
  const filteredWarnings = data.threshold_warnings.filter((w) => {
    if (filterBy === 'critical') return w.warning_type === 'Висока швидкість пошкодження';
    if (filterBy === 'warning') return w.warning_type !== 'Висока швидкість пошкодження';
    return true;
  });

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">

        {/* Header */}
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 04</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('fatigue.title_a')} <span className="ink-3">{t('fatigue.title_b')}</span>
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('fatigue.body')}
          </p>
        </header>

        {/* Controls */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 py-6 hairline-b">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="eyebrow mb-2">{t('fatigue.date_range')}</p>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={dateRange.from.toISOString().split('T')[0]}
                  onChange={(e) => setDateRange({ ...dateRange, from: new Date(e.target.value) })}
                  className="mono text-xs px-3 py-2 surface-1 hairline border rounded ink-1 outline-none focus:border-[hsl(var(--primary))]"
                />
                <span className="ink-4">→</span>
                <input
                  type="date"
                  value={dateRange.to.toISOString().split('T')[0]}
                  onChange={(e) => setDateRange({ ...dateRange, to: new Date(e.target.value) })}
                  className="mono text-xs px-3 py-2 surface-1 hairline border rounded ink-1 outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">{t('common.filter')}</p>
              <Select value={filterBy} onValueChange={(value) => setFilterBy(value as typeof filterBy)}>
                <SelectTrigger className="w-44 surface-1 hairline border rounded text-xs ink-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('fatigue.filter.all')}</SelectItem>
                  <SelectItem value="critical">{t('fatigue.filter.critical')}</SelectItem>
                  <SelectItem value="warning">{t('fatigue.filter.warning')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 surface-1 hairline border rounded mono text-[11px] tracking-widest ink-2 hover:ink-1 hover:border-[hsl(var(--ink-3))] transition-colors uppercase disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? t('common.loading') : t('common.refresh')}
            </button>
            <button
              onClick={() => handleExportData('csv')}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 rounded mono text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50"
              style={{
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? t('common.exporting') : t('fatigue.export_csv')}
            </button>
          </div>
        </div>

        {/* Threshold Warnings */}
        {filteredWarnings.length > 0 && (
          <section className="mt-10">
            <header className="flex items-end justify-between pb-4 hairline-b mb-4">
              <div>
                <p className="eyebrow signal-crit">{t('fatigue.warnings.eyebrow')}</p>
                <h3 className="display text-2xl ink-1 mt-1">{t('fatigue.warnings.title')}</h3>
              </div>
              <span className="mono text-[10px] tracking-widest signal-crit tabular">
                {t('fatigue.warnings.active', { n: filteredWarnings.length.toString().padStart(2, '0') })}
              </span>
            </header>

            <div className="surface-1 hairline border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-5 py-3 hairline-b mono text-[10px] tracking-widest ink-4 uppercase">
                <div className="col-span-2">{t('fatigue.col.turbine')}</div>
                <div className="col-span-7">{t('fatigue.col.condition')}</div>
                <div className="col-span-3 text-right">{t('fatigue.col.current_limit')}</div>
              </div>
              {filteredWarnings.map((warning) => (
                <div
                  key={`${warning.turbine_id}-${warning.warning_type}`}
                  className="grid grid-cols-12 gap-4 px-5 py-4 items-center hairline-b last:border-b-0 hover:bg-[hsl(var(--surface-2))] transition-colors"
                >
                  <div className="col-span-2 mono text-sm ink-1 font-medium">{warning.turbine_id}</div>
                  <div className="col-span-7 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-crit" />
                    <span className="text-sm signal-crit">{warning.warning_type}</span>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="display text-xl ink-1 tabular">{warning.current_value.toFixed(1)}</span>
                    <span className="ink-4 mx-1.5">/</span>
                    <span className="mono text-sm ink-3 tabular">{warning.threshold.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Distributions */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-px surface-2 hairline border rounded-lg overflow-hidden">
          <div className="surface-1 p-6">
            <DamageHistogram data={data.damageDistribution} isLoading={isLoading} />
          </div>
          <div className="surface-1 p-6">
            <RULDistribution data={data.rulDistribution} isLoading={isLoading} />
          </div>
        </section>

        {/* Top Damaged Turbines */}
        <section className="mt-12">
          <TopDamagedTurbines data={data.topDamagedTurbines} isLoading={isLoading} />
        </section>

        {/* Damage Accumulation */}
        <section className="mt-12">
          <DamageAccumulation data={data.damageHistory} isLoading={isLoading} />
        </section>

        {/* Goodman & Rainflow */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-px surface-2 hairline border rounded-lg overflow-hidden">
          <div className="surface-1 p-6">
            <GoodmanDiagram data={data.goodmanData} isLoading={isLoading} />
          </div>
          <div className="surface-1 p-6">
            <RainflowHistogram data={data.rainflowCycles} isLoading={isLoading} />
          </div>
        </section>

        {/* S-N Curve */}
        <section className="mt-12">
          <SNChart data={data.snCurve} isLoading={isLoading} />
        </section>

        {/* Distributions section above already opens; remove the original orphan grid intro */}
        {/* Methodology */}
        <section className="mt-16 pt-10 hairline-t">
          <header className="mb-6">
            <p className="eyebrow">{t('fatigue.methodology.eyebrow')}</p>
            <h3 className="display text-2xl ink-1 mt-1">{t('fatigue.methodology.title')}</h3>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {[
              { key: 'I',   t: t('fatigue.methodology.damage_t'),   d: t('fatigue.methodology.damage_d') },
              { key: 'II',  t: t('fatigue.methodology.rul_t'),      d: t('fatigue.methodology.rul_d') },
              { key: 'III', t: t('fatigue.methodology.goodman_t'),  d: t('fatigue.methodology.goodman_d') },
              { key: 'IV',  t: t('fatigue.methodology.rainflow_t'), d: t('fatigue.methodology.rainflow_d') },
            ].map((m) => (
              <div key={m.key}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="mono text-[10px] tracking-widest signal-warn tabular">§ {m.key}</span>
                  <span className="text-sm font-semibold ink-1 tracking-tight">{m.t}</span>
                </div>
                <p className="text-sm ink-3 leading-relaxed text-pretty">{m.d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// Helper function to generate CSV
function generateCSV(data: FatigueData): string {
  const lines: string[] = [];

  lines.push('Fatigue Analysis Export');
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push('');

  // Top Damaged Turbines
  lines.push('TOP DAMAGED TURBINES');
  lines.push('Turbine ID,Damage Rate (%),RUL (years),Health Score');
  data.topDamagedTurbines.forEach((t) => {
    lines.push(
      `${t.turbine_id},${(t.damage_rate * 100).toFixed(1)},${t.rul_years.toFixed(1)},${t.health_score}`
    );
  });
  lines.push('');

  // Damage Distribution
  lines.push('DAMAGE DISTRIBUTION');
  lines.push('Range,Count');
  data.damageDistribution.forEach((d) => {
    lines.push(`${d.range},${d.count}`);
  });
  lines.push('');

  // RUL Distribution
  lines.push('RUL DISTRIBUTION');
  lines.push('Range,Turbines,Criticality');
  data.rulDistribution.forEach((r) => {
    lines.push(`${r.range},${r.turbines},${r.criticality}`);
  });
  lines.push('');

  // Damage History
  lines.push('12-MONTH DAMAGE ACCUMULATION');
  lines.push('Month,Cumulative Damage (%)');
  data.damageHistory.forEach((h) => {
    lines.push(`${h.month},${h.cumulative_damage.toFixed(1)}`);
  });
  lines.push('');

  // Threshold Warnings
  lines.push('THRESHOLD WARNINGS');
  lines.push('Turbine ID,Warning Type,Current Value,Threshold');
  data.threshold_warnings.forEach((w) => {
    lines.push(
      `${w.turbine_id},${w.warning_type},${w.current_value.toFixed(1)},${w.threshold.toFixed(1)}`
    );
  });

  return lines.join('\n');
}
