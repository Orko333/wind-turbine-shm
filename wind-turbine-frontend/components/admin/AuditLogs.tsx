'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Download, Filter, Search } from 'lucide-react';
import { getApiWithAuth } from '../../lib/api';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  status: 'success' | 'failure';
  ipAddress: string;
  details: string;
}

interface BackendAuditLog {
  id: number;
  timestamp: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource: string | null;
  status: string;
  ip_address: string | null;
  details: string | null;
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');

  useEffect(() => {
    getApiWithAuth<BackendAuditLog[]>('/admin/audit-logs?limit=200')
      .then((rows) => {
        setLogs(
          rows.map((r) => ({
            id: String(r.id),
            timestamp: r.timestamp,
            userId: r.user_id || '',
            userName: r.user_name || 'system',
            action: r.action,
            resource: r.resource || '',
            status: (r.status === 'success' ? 'success' : 'failure') as 'success' | 'failure',
            ipAddress: r.ip_address || '',
            details: r.details || '',
          }))
        );
      })
      .catch((err) => {
        console.error('Load audit logs failed:', err);
        setLogs([]);
      });
  }, []);

  const filteredLogs = useCallback(() => {
    return logs.filter((log) => {
      const matchesSearch =
        searchQuery === '' ||
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAction = actionFilter === '' || log.action === actionFilter;
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;

      return matchesSearch && matchesAction && matchesStatus;
    });
  }, [logs, searchQuery, actionFilter, statusFilter]);

  const handleExport = useCallback(() => {
    const headers = ['timestamp', 'user', 'action', 'resource', 'status', 'ip'];
    const rows = filteredLogs().map((l) =>
      [l.timestamp, l.userName, l.action, l.resource, l.status, l.ipAddress].map((v) => `"${v}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  const getActionBadgeColor = useCallback((action: string) => {
    const colors: Record<string, string> = {
      CREATE: 'surface-3 signal-live',
      EDIT: 'surface-3 ink-2',
      DELETE: 'surface-3 signal-crit',
      VIEW: 'surface-3 ink-1',
      LOGIN: 'surface-3 signal-warn',
    };
    return colors[action] || 'surface-3 ink-1';
  }, []);

  const getStatusBadgeColor = useCallback((status: string) => {
    return status === 'success' ? 'surface-3 signal-live' : 'surface-3 signal-crit';
  }, []);

  const formatDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Фільтри */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Пошук</label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук за користувачем, дією або ресурсом..."
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={handleExport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Експорт CSV
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Дія</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">Всі дії</option>
                <option value="CREATE">Створити</option>
                <option value="EDIT">Редагувати</option>
                <option value="DELETE">Видалити</option>
                <option value="VIEW">Переглядати</option>
                <option value="LOGIN">Вхід</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Статус</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'failure')}
                className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="all">Всі статуси</option>
                <option value="success">Успішно</option>
                <option value="failure">Помилка</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setActionFilter('');
                  setStatusFilter('all');
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Скинути фільтри
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Таблиця логів */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Журнал аудиту ({filteredLogs().length})</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface-2 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Час</th>
                <th className="px-4 py-3 text-left font-medium">Користувач</th>
                <th className="px-4 py-3 text-left font-medium">Дія</th>
                <th className="px-4 py-3 text-left font-medium">Ресурс</th>
                <th className="px-4 py-3 text-left font-medium">Статус</th>
                <th className="px-4 py-3 text-left font-medium">IP-адреса</th>
                <th className="px-4 py-3 text-left font-medium">Деталі</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs().map((log) => (
                <tr key={log.id} className="border-b hover:surface-2">
                  <td className="px-4 py-3 text-xs ink-3">{formatDate(log.timestamp)}</td>
                  <td className="px-4 py-3 text-xs font-medium">{log.userName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {log.resource}
                    {log.resourceId && <div className="text-xs ink-3">{log.resourceId}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(log.status)}`}>
                      {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono ink-3">{log.ipAddress}</td>
                  <td className="px-4 py-3 text-xs ink-2 max-w-xs">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Підсумок активності */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs font-medium signal-live mb-1">Всього подій</p>
          <p className="text-2xl font-bold ink-1">{filteredLogs().length}</p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs font-medium signal-live mb-1">Успішні</p>
          <p className="text-2xl font-bold signal-live">
            {filteredLogs().filter((l) => l.status === 'success').length}
          </p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs font-medium signal-crit mb-1">Помилки</p>
          <p className="text-2xl font-bold signal-crit">
            {filteredLogs().filter((l) => l.status === 'failure').length}
          </p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs font-medium ink-2 mb-1">Унікальні користувачі</p>
          <p className="text-2xl font-bold ink-1">{new Set(logs.map((l) => l.userId)).size}</p>
        </Card>
      </div>

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Зберігання журналу аудиту</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Термін зберігання:</strong> Усі журнали зберігаються 24 місяці.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Незмінні записи:</strong> Журнали не можуть бути змінені або видалені (вимога відповідності).</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Експорт для перевірок:</strong> Завантажте журнали у форматі CSV для аудитів.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Чутливі операції:</strong> Усі адміністративні дії фіксуються з повними деталями.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
