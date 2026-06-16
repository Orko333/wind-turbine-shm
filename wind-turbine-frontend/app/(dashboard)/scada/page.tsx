'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTurbineList } from '@/hooks/useTurbineData';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/useToast';
import { RealtimeDataTable } from '@/components/scada/RealtimeDataTable';
import { ConnectionStatus } from '@/components/scada/ConnectionStatus';
import { HistoryChart } from '@/components/scada/HistoryChart';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import type { TurbineRealtimeData } from '@/types/api';
import { getApiWithAuth, getBlobWithAuth } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function SCADAPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [selectedTurbineId, setSelectedTurbineId] = useState<string>('');
  const [previousData, setPreviousData] = useState<TurbineRealtimeData | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const prevDataRef = useRef<TurbineRealtimeData | null>(null);

  // Fetch turbines list
  const { turbines = [], isLoading: isLoadingTurbines } = useTurbineList({
    page: 1,
    pageSize: 100,
  });

  // Встановити default turbine on load
  useEffect(() => {
    if (turbines.length > 0 && !selectedTurbineId) {
      setSelectedTurbineId(turbines[0].turbine_id);
    }
  }, [turbines, selectedTurbineId]);

  // Subscribe to real-time updates for selected turbine
  const { isConnected, getTurbineData } = useRealtime({
    turbineIds: selectedTurbineId ? [selectedTurbineId] : [],
    autoSubscribe: !!selectedTurbineId,
  });

  // Отримати current realtime дані
  const currentData = selectedTurbineId
    ? getTurbineData(selectedTurbineId)
    : null;

  // Оновити previous дані for trend tracking
  useEffect(() => {
    if (currentData && prevDataRef.current) {
      setPreviousData(prevDataRef.current);
    }
    if (currentData) {
      prevDataRef.current = currentData;
    }
  }, [currentData]);

  // Отримати selected turbine info
  const selectedTurbine = turbines.find(
    (t) => t.turbine_id === selectedTurbineId
  );

  // Export last 24h дані
  const handleExportData = useCallback(async () => {
    if (!selectedTurbineId) {
      showError('Please select a turbine');
      return;
    }

    setIsExporting(true);
    try {
      // Use the refresh-capable blob fetch (encodes Cyrillic turbine_id, retries
      // once on a stale token) instead of a raw fetch that failed silently.
      const blob = await getBlobWithAuth(
        `/scada/export/${encodeURIComponent(selectedTurbineId)}.csv?hours=24`
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `turbine-${selectedTurbineId}-24h-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      success('Дані експортовано успішно');
    } catch (err) {
      showError('Failed to export data');
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedTurbineId, success, showError]);

  const lastUpdateTime = currentData?.timestamp;

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">

        <header className="pb-10 hairline-b">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">{t('common.section')} · 07</p>
              <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
                {t('scada.title_a')} <span className="ink-3">{t('scada.title_b')}</span>
              </h1>
              <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
                {t('scada.body')}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className="eyebrow">{t('dashboard.stream')}</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full surface-1 hairline border ${isConnected ? 'glow-live' : ''}`}>
                <div className={`relative w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-live' : 'bg-crit'}`}>
                  {isConnected && <span className="absolute inset-0 rounded-full bg-live opacity-50 animate-ping" />}
                </div>
                <span className={`mono text-[10px] tracking-widest ${isConnected ? 'signal-live' : 'signal-crit'}`}>
                  {isConnected ? t('common.connected') : t('common.offline')}
                </span>
              </div>
              {lastUpdateTime && (
                <span className="mono text-[10px] ink-4 tabular" suppressHydrationWarning>
                  {new Date(lastUpdateTime).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 hairline-b items-end">
          <div className="lg:col-span-4">
            <p className="eyebrow mb-2">{t('scada.turbine_selection')}</p>
            <Select value={selectedTurbineId} onValueChange={setSelectedTurbineId}>
              <SelectTrigger className="surface-1 hairline border rounded text-sm ink-1 h-11">
                <SelectValue placeholder={t('scada.select_turbine')} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingTurbines ? (
                  <SelectItem value="_loading" disabled>{t('scada.loading_turbines')}</SelectItem>
                ) : turbines.length === 0 ? (
                  <SelectItem value="_empty" disabled>{t('scada.no_turbines')}</SelectItem>
                ) : (
                  turbines.map((turbine) => (
                    <SelectItem key={turbine.turbine_id} value={turbine.turbine_id}>
                      {turbine.name} ({turbine.turbine_id})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedTurbine ? (
            <div className="lg:col-span-6 grid grid-cols-2 lg:grid-cols-4 gap-px surface-2 hairline border rounded-lg overflow-hidden">
              <div className="p-4 surface-1">
                <p className="eyebrow">{t('scada.col.name')}</p>
                <p className="text-sm ink-1 font-medium mt-1.5 truncate">{selectedTurbine.name}</p>
              </div>
              <div className="p-4 surface-1">
                <p className="eyebrow">{t('scada.col.status')}</p>
                <p className="text-sm ink-1 font-medium capitalize mt-1.5">{selectedTurbine.status}</p>
              </div>
              <div className="p-4 surface-1">
                <p className="eyebrow">{t('scada.col.power')}</p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="display text-xl ink-1 tabular">{currentData?.power_kw ?? selectedTurbine.power_kw}</span>
                  <span className="text-xs ink-3">{t('common.kw')}</span>
                </div>
              </div>
              <div className="p-4 surface-1">
                <p className="eyebrow">{t('scada.col.rul')}</p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="display text-xl ink-1 tabular">{selectedTurbine.rul_years != null ? selectedTurbine.rul_years.toFixed(1) : '—'}</span>
                  <span className="text-xs ink-3">{t('common.year_short')}</span>
                </div>
              </div>
            </div>
          ) : <div className="lg:col-span-6" />}

          <div className="lg:col-span-2 flex justify-end">
            <button
              onClick={handleExportData}
              disabled={!selectedTurbineId || isExporting}
              className="flex items-center gap-2 px-4 py-2.5 rounded mono text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 w-full justify-center"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? t('common.exporting') : t('scada.export_24h')}
            </button>
          </div>
        </section>

        <section className="mt-10">
          <RealtimeDataTable
            data={currentData}
            previousData={previousData}
            isLoading={isLoadingTurbines}
          />
        </section>

        <section className="mt-10">
          <HistoryChart turbineId={selectedTurbineId || null} hours={24} />
        </section>

        <section className="mt-12 pt-8 hairline-t">
          <p className="eyebrow mb-4">{t('scada.legend.title')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px surface-2 hairline border rounded-lg overflow-hidden">
            {[
              { c: 'bg-live', label: t('status.healthy'),  desc: t('scada.legend.healthy_d'),  cls: 'signal-live' },
              { c: 'bg-warn', label: t('status.warning'),  desc: t('scada.legend.warning_d'),  cls: 'signal-warn' },
              { c: 'bg-crit', label: t('status.critical'), desc: t('scada.legend.critical_d'), cls: 'signal-crit' },
            ].map((s) => (
              <div key={s.label} className="p-5 surface-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.c}`} />
                  <span className={`mono text-[10px] tracking-widest uppercase ${s.cls}`}>{s.label}</span>
                </div>
                <p className="text-sm ink-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
