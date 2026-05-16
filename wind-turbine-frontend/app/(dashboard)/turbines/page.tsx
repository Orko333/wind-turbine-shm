'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

  // Fetch turbines (server-side pagination only; filtering and sorting are client-side
  // so the user immediately sees results without re-querying the backend)
  const {
    turbines: pageTurbines,
    total,
    isLoading: isLoadingTurbines,
    error: turbineError,
  } = useTurbineList({
    page: pagination.page,
    pageSize: pagination.pageSize,
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

  // Extract unique locations (owner_id field is used to store location label by backend)
  useEffect(() => {
    const uniqueLocations = Array.from(
      new Set(allTurbines.map((t) => t.owner_id).filter(Boolean))
    );
    setLocations(uniqueLocations as string[]);
  }, [allTurbines]);

  // Client-side filter + sort: server returns paginated list; we apply remaining filters here
  const filteredTurbines = useMemo(() => {
    let list = allTurbines;

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.turbine_id.toLowerCase().includes(q)
      );
    }

    if (filters.turbineStatus) {
      list = list.filter((t) => t.status === filters.turbineStatus);
    }

    if (filters.location) {
      list = list.filter((t) => t.owner_id === filters.location);
    }

    if (filters.rulRange) {
      const [min, max] = filters.rulRange;
      list = list.filter((t) => t.rul_years >= min && t.rul_years <= max);
    }

    const sortBy = (filters.sortBy as keyof Turbine) || 'name';
    const sortOrder = filters.sortOrder || 'asc';
    list = [...list].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [allTurbines, filters]);

  // Оновити pagination total
  useEffect(() => {
    setTotal(total);
  }, [total, setTotal]);

  // Filters are applied client-side, so we just update store state — no need to refetch
  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);
    },
    [setFilters]
  );

  const handleResetFilters = useCallback(() => {
    resetFilters();
  }, [resetFilters]);

  const handleSortChange = useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      updateFilter('sortBy', sortBy);
      updateFilter('sortOrder', sortOrder);
    },
    [updateFilter]
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
              turbines={filteredTurbines}
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
