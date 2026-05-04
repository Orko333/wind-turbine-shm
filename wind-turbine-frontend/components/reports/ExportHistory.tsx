'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Download, Eye, Trash2, Calendar } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useLocale } from '../../lib/i18n';

interface ExportRecord {
  id: string;
  reportTitle: string;
  exportedAt: string;
  exportedBy: string;
  format: 'pdf' | 'csv' | 'json' | 'xlsx';
  fileSize: string;
  turbineCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  status: 'completed' | 'pending' | 'failed';
}

const sampleExports: ExportRecord[] = [
  {
    id: '1',
    reportTitle: 'Q1 2025 Wind Farm Performance',
    exportedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    exportedBy: 'admin@example.com',
    format: 'pdf',
    fileSize: '12.5 MB',
    turbineCount: 15,
    dateRange: {
      start: '2025-01-01',
      end: '2025-03-31',
    },
    status: 'completed',
  },
  {
    id: '2',
    reportTitle: 'Monthly Efficiency Report - March',
    exportedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    exportedBy: 'engineer@example.com',
    format: 'xlsx',
    fileSize: '3.2 MB',
    turbineCount: 15,
    dateRange: {
      start: '2025-03-01',
      end: '2025-03-31',
    },
    status: 'completed',
  },
  {
    id: '3',
    reportTitle: 'Maintenance Plan Analysis',
    exportedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    exportedBy: 'manager@example.com',
    format: 'pdf',
    fileSize: '8.7 MB',
    turbineCount: 15,
    dateRange: {
      start: '2025-01-01',
      end: '2025-03-31',
    },
    status: 'completed',
  },
  {
    id: '4',
    reportTitle: 'RUL Forecast Dashboard',
    exportedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    exportedBy: 'admin@example.com',
    format: 'csv',
    fileSize: '2.1 MB',
    turbineCount: 15,
    dateRange: {
      start: '2025-03-15',
      end: '2025-05-02',
    },
    status: 'pending',
  },
  {
    id: '5',
    reportTitle: 'Damage Accumulation Trends',
    exportedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    exportedBy: 'engineer@example.com',
    format: 'json',
    fileSize: '1.8 MB',
    turbineCount: 15,
    dateRange: {
      start: '2024-12-01',
      end: '2025-03-31',
    },
    status: 'completed',
  },
];

const UI_TEXT = {
  en: {
    downloadStarted: 'Report download started',
    downloadFailed: 'Failed to download report',
    deleteConfirm: 'Are you sure you want to delete this export?',
    deleteSuccess: 'Export deleted successfully',
    deleteFailed: 'Failed to delete export',
    bulkDeleteConfirmPrefix: 'Delete',
    bulkDeleteConfirmSuffix: 'selected export(s)?',
    bulkDeleteSuccess: 'Exports deleted successfully',
    bulkDeleteFailed: 'Failed to delete exports',
    exportHistory: 'Export History',
    selected: 'selected',
    deleteSelected: 'Delete Selected',
    reportTitle: 'Report Title',
    exported: 'Exported',
    format: 'Format',
    size: 'Size',
    status: 'Status',
    actions: 'Actions',
    dateTo: 'to',
    titleDownload: 'Download',
    titleViewDetails: 'View details',
    titleDelete: 'Delete',
    viewSoon: 'View functionality coming soon',
    storageRetention: 'Storage & Retention',
  },
  uk: {
    downloadStarted: 'Завантаження звіту розпочато',
    downloadFailed: 'Не вдалося завантажити звіт',
    deleteConfirm: 'Ви впевнені, що хочете видалити цей експорт?',
    deleteSuccess: 'Експорт успішно видалено',
    deleteFailed: 'Не вдалося видалити експорт',
    bulkDeleteConfirmPrefix: 'Видалити',
    bulkDeleteConfirmSuffix: 'обраних експортів?',
    bulkDeleteSuccess: 'Експорти успішно видалено',
    bulkDeleteFailed: 'Не вдалося видалити експорти',
    exportHistory: 'Історія експортів',
    selected: 'обрано',
    deleteSelected: 'Видалити обрані',
    reportTitle: 'Назва звіту',
    exported: 'Експортовано',
    format: 'Формат',
    size: 'Розмір',
    status: 'Статус',
    actions: 'Дії',
    dateTo: 'до',
    titleDownload: 'Завантажити',
    titleViewDetails: 'Переглянути деталі',
    titleDelete: 'Видалити',
    viewSoon: 'Функціональність перегляду скоро буде доступна',
    storageRetention: 'Сховище та зберігання',
  },
} as const;

export function ExportHistory() {
  const { success, error: showError, info } = useToast();
  const { locale } = useLocale();
  const L = UI_TEXT[locale];
  const [exports, setExports] = useState<ExportRecord[]>(sampleExports);
  const [selectedExports, setSelectedExports] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleSelect = useCallback((exportId: string) => {
    setSelectedExports((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(exportId)) {
        newSet.delete(exportId);
      } else {
        newSet.add(exportId);
      }
      return newSet;
    });
  }, []);

  const handleDownload = useCallback((exportId: string) => {
    void exportId;
    success(L.downloadStarted);
  }, [success, L.downloadStarted]);

  const handleDelete = useCallback((exportId: string) => {
    setIsDeleting(true);
    setExports((prev) => prev.filter((e) => e.id !== exportId));
    success(L.deleteSuccess);
    setIsDeleting(false);
  }, [success, L.deleteSuccess]);

  const handleBulkDelete = useCallback(() => {
    setIsDeleting(true);
    setExports((prev) => prev.filter((e) => !selectedExports.has(e.id)));
    setSelectedExports(new Set());
    success(L.bulkDeleteSuccess);
    setIsDeleting(false);
  }, [selectedExports, success, L.bulkDeleteSuccess]);

  void showError;

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale === 'uk' ? 'uk-UA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [locale]);

  const formatFileSize = useCallback((size: string) => {
    return size;
  }, []);

  const getFormatBadgeColor = useCallback((format: string) => {
    const colors: Record<string, string> = {
      pdf: 'surface-3 signal-crit',
      csv: 'surface-3 signal-live',
      xlsx: 'surface-3 ink-2',
      json: 'surface-3 ink-2',
    };
    return colors[format] || 'surface-3 ink-1';
  }, []);

  const getStatusBadgeColor = useCallback((status: string) => {
    const colors: Record<string, string> = {
      completed: 'surface-3 signal-live',
      pending: 'surface-3 signal-warn',
      failed: 'surface-3 signal-crit',
    };
    return colors[status] || 'surface-3 ink-1';
  }, []);

  return (
    <div className="space-y-6">
      {/* Export List Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{L.exportHistory} ({exports.length})</h3>
          {selectedExports.size > 0 && (
            <div className="flex gap-2">
              <span className="text-sm ink-3 py-2">{selectedExports.size} {L.selected}</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {L.deleteSelected}
              </Button>
            </div>
          )}
        </div>

        {/* Exports Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface-2 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedExports(new Set(exports.map((ex) => ex.id)));
                      } else {
                        setSelectedExports(new Set());
                      }
                    }}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">{L.reportTitle}</th>
                <th className="px-4 py-3 text-left font-medium">{L.exported}</th>
                <th className="px-4 py-3 text-left font-medium">{L.format}</th>
                <th className="px-4 py-3 text-left font-medium">{L.size}</th>
                <th className="px-4 py-3 text-left font-medium">{L.status}</th>
                <th className="px-4 py-3 text-left font-medium">{L.actions}</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exp, idx) => (
                <tr key={idx} className="border-b hover:surface-2">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedExports.has(exp.id)}
                      onChange={() => handleToggleSelect(exp.id)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{exp.reportTitle}</p>
                      <p className="text-xs ink-3">{exp.exportedBy}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(exp.exportedAt)}
                      </div>
                      <p className="ink-3 text-xs mt-1">
                        {exp.dateRange.start} {L.dateTo} {exp.dateRange.end}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getFormatBadgeColor(exp.format)}`}>
                      {exp.format.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{formatFileSize(exp.fileSize)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(exp.status)}`}>
                      {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(exp.id)}
                        title={L.titleDownload}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => info(L.viewSoon)}
                        title={L.titleViewDetails}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(exp.id)}
                        disabled={isDeleting}
                        className="signal-crit hover:signal-crit"
                        title={L.titleDelete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Storage Information */}
      <Card className="p-6 surface-2 hairline border">
        <h3 className="font-semibold mb-4">{L.storageRetention}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="font-medium mb-1">Total Storage Used</p>
            <p className="text-2xl font-bold">47.2 MB</p>
            <p className="text-xs ink-3 mt-1">of 1 GB quota (4.7%)</p>
          </div>
          <div>
            <p className="font-medium mb-1">Oldest Export</p>
            <p className="text-base">2024-12-01</p>
            <p className="text-xs ink-3 mt-1">5 months retained</p>
          </div>
          <div>
            <p className="font-medium mb-1">Retention Policy</p>
            <p className="text-base">12 months</p>
            <p className="text-xs ink-3 mt-1">Auto-cleanup enabled</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
