'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  Minus,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Turbine, TurbineRealtimeData } from '@/types/api';
import { useT } from '@/lib/i18n';

interface TurbineTableProps {
  turbines: Turbine[];
  isLoading?: boolean;
  _onSelectionChange?: (selectedIds: string[]) => void;
  onExport?: (selectedIds: string[]) => void;
  realtimeData?: Record<string, TurbineRealtimeData>;
  sortBy?: keyof Turbine;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: keyof Turbine, sortOrder: 'asc' | 'desc') => void;
}

type SortableColumn = 'status' | 'power_kw' | 'rul_years' | 'wind_speed' | 'rotor_rpm';

export function TurbineTable({
  turbines,
  isLoading = false,
  _onSelectionChange,
  onExport,
  realtimeData = {},
  sortBy = 'name',
  sortOrder = 'asc',
  onSortChange,
}: TurbineTableProps) {
  const t = useT();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);

  // Пагінація
  const displayedTurbines = turbines.slice(0, pageSize);

  // Обробка виділення
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === displayedTurbines.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedTurbines.map((t) => t.turbine_id)));
    }
  }, [displayedTurbines, selectedIds]);

  const handleSelectOne = useCallback((turbineId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(turbineId)) {
        next.delete(turbineId);
      } else {
        next.add(turbineId);
      }
      return next;
    });
  }, []);

  // Оновити батьківський компонент при зміні виділення
  const handleExport = useCallback(() => {
    const ids = Array.from(selectedIds);
    onExport?.(ids);
  }, [selectedIds, onExport]);

  // Обробка сортування
  const handleSort = (column: SortableColumn) => {
    if (onSortChange) {
      const newOrder =
        sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
      onSortChange(column, newOrder);
    }
  };

  // Кольори статусу
  const statusColors = {
    healthy: 'surface-3 signal-live',
    warning: 'surface-3 signal-warn',
    critical: 'surface-3 signal-crit',
    offline: 'surface-3 ink-1',
  };

  // Індикатор сортування
  const SortIcon = ({ column }: { column: SortableColumn }) => {
    if (sortBy !== column) return <div className="w-4" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="space-y-4">
        {/* Заголовок з елементами керування */}
        <div className="p-6 pb-0 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('turbines.list')}</h3>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {t('turbines.selected', { n: selectedIds.size })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExport}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('turbines.export_csv')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Селектор розміру сторінки */}
        <div className="px-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('turbines.show')}:</span>
          {([10, 25, 50] as const).map((size) => (
            <Button
              key={size}
              size="sm"
              variant={pageSize === size ? 'default' : 'outline'}
              onClick={() => setPageSize(size)}
              className="w-12"
            >
              {size}
            </Button>
          ))}
          <span className="text-sm text-muted-foreground">
            {t('turbines.rows')} {t('turbines.total', { n: turbines.length })}
          </span>
        </div>

        {/* Таблиця */}
        <div className="relative w-full overflow-auto">
          <table className="w-full text-sm">
            {/* Заголовок */}
            <thead>
              <tr className="border-t border-b bg-muted/50 hover:bg-muted/70">
                <th className="w-12 px-6 py-3 text-left font-medium">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center justify-center w-5 h-5 border rounded"
                    title={
                      selectedIds.size === displayedTurbines.length
                        ? t('turbines.deselect_all')
                        : t('turbines.select_all')
                    }
                  >
                    {selectedIds.size === displayedTurbines.length ? (
                      <Check className="w-3 h-3" />
                    ) : selectedIds.size > 0 ? (
                      <Minus className="w-3 h-3" />
                    ) : null}
                  </button>
                </th>
                <th className="px-6 py-3 text-left font-medium">{t('turbines.col.name')}</th>
                <th className="px-6 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-2"
                  >
                    {t('turbines.col.status')}
                    <SortIcon column="status" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left font-medium">{t('turbines.col.location')}</th>
                <th className="px-6 py-3 text-right font-medium">
                  <button
                    onClick={() => handleSort('power_kw')}
                    className="flex items-center justify-end gap-2 w-full"
                  >
                    {t('turbines.col.power')}
                    <SortIcon column="power_kw" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right font-medium">
                  <button
                    onClick={() => handleSort('rul_years')}
                    className="flex items-center justify-end gap-2 w-full"
                  >
                    {t('turbines.col.rul')}
                    <SortIcon column="rul_years" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right font-medium">{t('turbines.col.wind_speed')}</th>
              </tr>
            </thead>

            {/* Тіло */}
            <tbody>
              {isLoading && !turbines.length
                ? [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b">
                      <td className="px-6 py-4">
                        <Skeleton className="h-5 w-5" />
                      </td>
                      {[1, 2, 3, 4, 5, 6].map((j) => (
                        <td key={j} className="px-6 py-4">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : displayedTurbines.map((turbine) => {
                    const realtime = realtimeData[turbine.turbine_id];
                    const power = realtime?.power_kw ?? turbine.power_kw;
                    const windSpeed = realtime?.wind_speed ?? turbine.wind_speed;
                    const isSelected = selectedIds.has(turbine.turbine_id);

                    return (
                      <tr
                        key={turbine.turbine_id}
                        className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() =>
                          router.push(`/turbines/${turbine.turbine_id}`)
                        }
                      >
                        <td
                          className="px-6 py-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOne(turbine.turbine_id);
                          }}
                        >
                          <button
                            className="flex items-center justify-center w-5 h-5 border rounded"
                            title={
                              isSelected
                                ? t('turbines.deselect_turbine')
                                : t('turbines.select_turbine')
                            }
                          >
                            {isSelected && (
                              <Check className="w-3 h-3" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {turbine.name}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              'capitalize text-xs',
                              statusColors[
                                turbine.status as keyof typeof statusColors
                              ]
                            )}
                          >
                            {turbine.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {turbine.owner_id || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          {Math.round(power)} {t('common.kw')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {turbine.rul_years.toFixed(1)} {t('turbines.years_short')}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {windSpeed.toFixed(1)} m/s
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {/* Стан порожнього списку */}
          {!isLoading && turbines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">{t('turbines.no_results')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('turbines.no_results_desc')}
              </p>
            </div>
          )}
        </div>

        {/* Футер з інформацією про пагінацію */}
        <div className="px-6 py-4 border-t text-sm text-muted-foreground">
          {t('turbines.showing', { n: Math.min(pageSize, displayedTurbines.length), total: turbines.length })}
        </div>
      </div>
    </Card>
  );
}
