'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTurbineList } from '@/hooks/useTurbineData';
import { useRealtime } from '@/hooks/useRealtime';
import { useFiltersStore } from '@/store/filters';
import { useToast } from '@/hooks/useToast';
import { TurbineTable } from '@/components/turbines/TurbineTable';
import { TurbineFilters } from '@/components/turbines/TurbineFilters';
import type { FilterState } from '@/types/domain';
import type { Turbine } from '@/types/api';
import { useT } from '@/lib/i18n';

export default function TurbinesPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [allTurbines, setAllTurbines] = useState<Turbine[]>([]);
  const [locations, setLocations] = useState<string[]>([]);

  // Отримати filters from store
  const {
    filters,
    pagination,
    updateFilter,
    setFilters,
    resetFilters,
    setPage,
    setTotal,
  } = useFiltersStore();

  // Fetch turbines with current filters
  const {
    turbines: pageTurbines,
    total,
    isLoading: isLoadingTurbines,
    error: turbineError,
  } = useTurbineList({
    page: pagination.page,
    pageSize: pagination.pageSize,
    status: filters.turbineStatus,
    location: filters.location,
    enabled: true,
  });

  // Subscribe to real-time updates for all turbines
  const turbineIds = allTurbines.map((t) => t.turbine_id);
  const { isConnected: isRealtimeConnected } = useRealtime({
    turbineIds,
    autoSubscribe: turbineIds.length > 0,
  });

  // Accumulate turbines as pages load
  useEffect(() => {
    setAllTurbines((prev) => {
      const newTurbines = pageTurbines.filter(
        (t) => !prev.find((p) => p.turbine_id === t.turbine_id)
      );
      return [...prev, ...newTurbines];
    });
  }, [pageTurbines]);

  // Extract unique locations
  useEffect(() => {
    const uniqueLocations = Array.from(
      new Set(allTurbines.map((t) => t.owner_id).filter(Boolean))
    );
    setLocations(uniqueLocations as string[]);
  }, [allTurbines]);

  // Оновити pagination total
  useEffect(() => {
    setTotal(total);
  }, [total, setTotal]);

  // Обробити filter changes
  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);
      setPage(1); // Reset to first page when filters change
      setAllTurbines([]); // Clear accumulated turbines
    },
    [setFilters, setPage]
  );

  // Обробити reset filters
  const handleResetFilters = useCallback(() => {
    resetFilters();
    setAllTurbines([]); // Clear accumulated turbines
  }, [resetFilters]);

  // Обробити sort
  const handleSortChange = useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      updateFilter('sortBy', sortBy);
      updateFilter('sortOrder', sortOrder);
      setPage(1);
      setAllTurbines([]); // Clear accumulated turbines
    },
    [updateFilter, setPage]
  );


  // Обробити export
  const handleExport = useCallback(
    (selectedIds: string[]) => {
      try {
        const selectedTurbines = allTurbines.filter((t) =>
          selectedIds.includes(t.turbine_id)
        );

        // Створити CSV content
        const headers = [
          'ID',
          'Назва',
          'Статус',
          'Потужність (кВт)',
          'RUL (роки)',
          'Швидкість вітру (м/с)',
          'Оберти ротора (RPM)',
        ];
        const rows = selectedTurbines.map((t) => [
          t.turbine_id,
          t.name,
          t.status,
          t.power_kw,
          t.rul_years.toFixed(1),
          t.wind_speed.toFixed(1),
          t.rotor_rpm.toFixed(1),
        ]);

        const csv =
          [headers, ...rows]
            .map((row) => row.map((cell) => `"${cell}"`).join(','))
            .join('\n') + '\n';

        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `turbines-export-${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        success(t('turbines.exported_count', { n: selectedIds.length }));
      } catch (err) {
        showError(t('turbines.export_failed'));
        console.error(err);
      }
    },
    [allTurbines, success, showError, t]
  );

  // Show помилка banner if there's an помилка
  useEffect(() => {
    if (turbineError) {
      showError(t('turbines.load_failed'));
    }
  }, [turbineError, showError, t]);

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">{t('common.section')} · 02</p>
              <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
                {t('turbines.title_a')} <span className="ink-3">{t('turbines.title_b')}</span>
              </h1>
              <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
                {allTurbines.length
                  ? t('turbines.body', { n: allTurbines.length })
                  : t('turbines.body_all')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className="eyebrow">{t('dashboard.stream')}</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full surface-1 hairline border ${isRealtimeConnected ? 'glow-live' : ''}`}>
                <div className={`relative w-1.5 h-1.5 rounded-full ${isRealtimeConnected ? 'bg-live' : 'bg-warn'}`}>
                  {isRealtimeConnected && <span className="absolute inset-0 rounded-full bg-live opacity-50 animate-ping" />}
                </div>
                <span className={`mono text-[10px] tracking-widest ${isRealtimeConnected ? 'signal-live' : 'signal-warn'}`}>
                  {isRealtimeConnected ? t('common.live') : t('common.retry')}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-10">
          <div className="lg:col-span-3">
            <TurbineFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onReset={handleResetFilters}
              locations={locations}
              isLoading={isLoadingTurbines}
            />
          </div>

          <div className="lg:col-span-9">
            <TurbineTable
              turbines={allTurbines}
              isLoading={isLoadingTurbines}
              onExport={handleExport}
              sortBy={(filters.sortBy || 'name') as 'status' | 'power_kw' | 'rul_years' | 'wind_speed' | 'rotor_rpm'}
              sortOrder={filters.sortOrder || 'asc'}
              onSortChange={handleSortChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
