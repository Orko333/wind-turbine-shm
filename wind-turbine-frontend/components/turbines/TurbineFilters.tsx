'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import type { FilterState } from '@/types/domain';
import { useT } from '@/lib/i18n';

interface TurbineFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReset?: () => void;
  locations?: string[];
  isLoading?: boolean;
}

export function TurbineFilters({
  filters,
  onFilterChange,
  onReset,
  locations = [],
  isLoading = false,
}: TurbineFiltersProps) {
  const t = useT();
  const RUL_MAX = 25;
  const [rulMin, setRulMin] = useState(
    filters.rulRange?.[0] ?? 0
  );
  const [rulMax, setRulMax] = useState(
    filters.rulRange?.[1] ?? RUL_MAX
  );

  // Sync slider state back when filters reset externally
  useEffect(() => {
    setRulMin(filters.rulRange?.[0] ?? 0);
    setRulMax(filters.rulRange?.[1] ?? RUL_MAX);
  }, [filters.rulRange]);

  // Оновити пошуковий запит
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filters,
        searchQuery: e.target.value || undefined,
      });
    },
    [filters, onFilterChange]
  );

  // Оновити фільтр статусу
  const handleStatusChange = useCallback(
    (status: string | null) => {
      onFilterChange({
        ...filters,
        turbineStatus: status === 'all' || !status ? undefined : status,
      });
    },
    [filters, onFilterChange]
  );

  // Оновити фільтр локації
  const handleLocationChange = useCallback(
    (location: string | null) => {
      onFilterChange({
        ...filters,
        location: location === 'all' || !location ? undefined : location,
      });
    },
    [filters, onFilterChange]
  );

  // Оновити діапазон RUL
  const handleRulChange = useCallback(() => {
    onFilterChange({
      ...filters,
      rulRange: [rulMin, rulMax],
    });
  }, [filters, onFilterChange, rulMin, rulMax]);

  // Оновити сортування
  const handleSortChange = useCallback(
    (sortBy: string | null) => {
      onFilterChange({
        ...filters,
        sortBy: sortBy || 'name',
      });
    },
    [filters, onFilterChange]
  );

  // Оновити порядок сортування
  const handleSortOrderChange = useCallback(
    (sortOrder: 'asc' | 'desc') => {
      onFilterChange({
        ...filters,
        sortOrder,
      });
    },
    [filters, onFilterChange]
  );

  // Перевірити, чи активні фільтри
  const hasActiveFilters =
    filters.searchQuery ||
    filters.turbineStatus ||
    filters.location ||
    (filters.rulRange && (filters.rulRange[0] > 0 || filters.rulRange[1] < RUL_MAX));

  return (
    <div className="surface-1 hairline border rounded-lg p-5">
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between pb-3 hairline-b">
          <div>
            <p className="eyebrow">{t('turbines.refine')}</p>
            <h3 className="display text-xl ink-1 mt-1">{t('turbines.filters')}</h3>
          </div>
          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 mono text-[10px] tracking-widest ink-3 hover:ink-1 transition-colors uppercase"
            >
              <X className="w-3 h-3" />
              {t('common.reset')}
            </button>
          )}
        </div>

        {/* Пошук */}
        <div className="space-y-2">
          <label className="eyebrow">{t('common.search')}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('turbines.search_placeholder')}
              value={filters.searchQuery || ''}
              onChange={handleSearchChange}
              disabled={isLoading}
              className="pl-10"
            />
          </div>
        </div>

        {/* Фільтр статусу */}
        <div className="space-y-2">
          <label className="eyebrow">{t('common.status')}</label>
          <Select
            value={filters.turbineStatus || 'all'}
            onValueChange={handleStatusChange}
            disabled={isLoading}
          >
            <SelectItem value="all">{t('turbines.all_statuses')}</SelectItem>
            <SelectItem value="healthy">{t('status.healthy')}</SelectItem>
            <SelectItem value="warning">{t('status.warning')}</SelectItem>
            <SelectItem value="critical">{t('status.critical')}</SelectItem>
            <SelectItem value="offline">{t('status.offline')}</SelectItem>
          </Select>
        </div>

        {/* Фільтр локації */}
        {locations.length > 0 && (
          <div className="space-y-2">
            <label className="eyebrow">{t('turbines.location')}</label>
            <Select
              value={filters.location || 'all'}
              onValueChange={handleLocationChange}
              disabled={isLoading}
            >
              <SelectItem value="all">{t('turbines.all_locations')}</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </Select>
          </div>
        )}

        {/* Діапазон RUL */}
        <div className="space-y-2">
          <label className="eyebrow">
            {t('turbines.rul_range_value', { min: rulMin.toFixed(1), max: rulMax.toFixed(1) })}
          </label>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('turbines.minimum')}</label>
              <Input
                type="range"
                min="0"
                max={RUL_MAX}
                step="0.5"
                value={rulMin}
                onChange={(e) => setRulMin(Number(e.target.value))}
                onMouseUp={handleRulChange}
                onTouchEnd={handleRulChange}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('turbines.maximum')}</label>
              <Input
                type="range"
                min="0"
                max={RUL_MAX}
                step="0.5"
                value={rulMax}
                onChange={(e) => setRulMax(Number(e.target.value))}
                onMouseUp={handleRulChange}
                onTouchEnd={handleRulChange}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Опції сортування */}
        <div className="space-y-3 pt-4 border-t">
          <label className="eyebrow">{t('turbines.sort_by')}</label>
          <Select
            value={filters.sortBy || 'name'}
            onValueChange={handleSortChange}
            disabled={isLoading}
          >
            <SelectItem value="name">{t('turbines.sort.name')}</SelectItem>
            <SelectItem value="status">{t('common.status')}</SelectItem>
            <SelectItem value="power_kw">{t('turbines.sort.power')}</SelectItem>
            <SelectItem value="rul_years">{t('turbines.sort.rul')}</SelectItem>
            <SelectItem value="last_update">{t('turbines.sort.last_update')}</SelectItem>
          </Select>

          <Select
            value={filters.sortOrder || 'asc'}
            onValueChange={(value) =>
              handleSortOrderChange(value as 'asc' | 'desc')
            }
            disabled={isLoading}
          >
            <SelectItem value="asc">{t('turbines.sort_asc')}</SelectItem>
            <SelectItem value="desc">{t('turbines.sort_desc')}</SelectItem>
          </Select>
        </div>
      </div>
    </div>
  );
}
