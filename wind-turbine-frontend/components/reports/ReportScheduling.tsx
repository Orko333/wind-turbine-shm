'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '../../hooks/useToast';
import { postApiWithAuth } from '../../lib/api';
import { Clock, Plus, Edit2, Trash2, Mail } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

interface ScheduledReport {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: string;
  dayOfMonth?: number;
  time: string;
  format: 'pdf' | 'csv' | 'xlsx';
  recipients: string[];
  metrics: string[];
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
}

const UI_TEXT = {
  en: {
    promptEmail: 'Enter email address:',
    requiredFields: 'Please fill in all required fields',
    scheduleUpdated: 'Schedule updated',
    scheduleCreated: 'Schedule created',
    scheduleSaveFailed: 'Failed to save schedule',
    deleteScheduleConfirm: 'Delete this schedule?',
    scheduleDeleted: 'Schedule deleted',
    deleteFailed: 'Failed to delete schedule',
    enabled: 'Enabled',
    format: 'Format',
    recipients: 'Recipients',
    metrics: 'Metrics',
    nextRun: 'Next Run',
    recipientCount: 'recipient(s)',
    metricCount: 'metric(s)',
    editSchedule: 'Edit Schedule',
    createSchedule: 'Create New Schedule',
    scheduleName: 'Schedule Name',
    frequency: 'Frequency',
    time: 'Time',
    exportFormat: 'Export Format',
    emailRecipients: 'Email Recipients',
    addRecipient: 'Add Recipient',
    metricsInclude: 'Metrics to Include',
    cancel: 'Cancel',
    saving: 'Saving...',
    saveSchedule: 'Save Schedule',
    automatedTitle: 'Automated Report Scheduling',
  },
  uk: {
    promptEmail: 'Введіть адресу email:',
    requiredFields: 'Будь ласка, заповніть усі обовʼязкові поля',
    scheduleUpdated: 'Розклад оновлено',
    scheduleCreated: 'Розклад створено',
    scheduleSaveFailed: 'Не вдалося зберегти розклад',
    deleteScheduleConfirm: 'Видалити цей розклад?',
    scheduleDeleted: 'Розклад видалено',
    deleteFailed: 'Не вдалося видалити розклад',
    enabled: 'Увімкнено',
    format: 'Формат',
    recipients: 'Отримувачі',
    metrics: 'Показники',
    nextRun: 'Наступний запуск',
    recipientCount: 'отримувач(ів)',
    metricCount: 'показник(ів)',
    editSchedule: 'Редагувати розклад',
    createSchedule: 'Створити новий розклад',
    scheduleName: 'Назва розкладу',
    frequency: 'Частота',
    time: 'Час',
    exportFormat: 'Формат експорту',
    emailRecipients: 'Отримувачі email',
    addRecipient: 'Додати отримувача',
    metricsInclude: 'Показники для включення',
    cancel: 'Скасувати',
    saving: 'Збереження...',
    saveSchedule: 'Зберегти розклад',
    automatedTitle: 'Автоматичний розклад звітів',
  },
} as const;

export function ReportScheduling() {
  const { success, error: showError } = useToast();
  const { locale } = useLocale();
  const L = UI_TEXT[locale];
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [schedules, setSchedules] = useState<ScheduledReport[]>([
    {
      id: '1',
      name: 'Daily Performance Summary',
      frequency: 'daily',
      time: '06:00',
      format: 'pdf',
      recipients: ['team@example.com'],
      metrics: ['power_output', 'availability', 'efficiency'],
      enabled: true,
      lastRun: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      name: 'Weekly Maintenance Report',
      frequency: 'weekly',
      dayOfWeek: 'Monday',
      time: '09:00',
      format: 'xlsx',
      recipients: ['maintenance@example.com'],
      metrics: ['damage', 'rul', 'vibration'],
      enabled: true,
      lastRun: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      nextRun: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      name: 'Monthly Executive Summary',
      frequency: 'monthly',
      dayOfMonth: 1,
      time: '08:00',
      format: 'pdf',
      recipients: ['ceo@example.com', 'cfo@example.com'],
      metrics: ['power_output', 'efficiency', 'availability', 'damage'],
      enabled: true,
      lastRun: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      nextRun: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  const [formData, setFormData] = useState<Partial<ScheduledReport>>({
    name: '',
    frequency: 'daily',
    time: '06:00',
    format: 'pdf',
    recipients: [],
    metrics: [],
    enabled: true,
  });

  const handleInputChange = useCallback(
    (field: string, value: unknown) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleAddRecipient = useCallback(() => {
    const email = prompt(L.promptEmail);
    if (email) {
      setFormData((prev) => ({
        ...prev,
        recipients: [...(prev.recipients || []), email],
      }));
    }
  }, [L.promptEmail]);

  const handleRemoveRecipient = useCallback((email: string) => {
    setFormData((prev) => ({
      ...prev,
      recipients: prev.recipients?.filter((r) => r !== email) || [],
    }));
  }, []);

  const handleAddMetric = useCallback((metric: string) => {
    setFormData((prev) => ({
      ...prev,
      metrics: prev.metrics?.includes(metric)
        ? prev.metrics.filter((m) => m !== metric)
        : [...(prev.metrics || []), metric],
    }));
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    if (!formData.name || !formData.recipients?.length) {
      showError(L.requiredFields);
      return;
    }

    try {
      setIsSaving(true);
      if (isEditing) {
        await postApiWithAuth(`/reports/schedules/${isEditing}`, formData);
        setSchedules((prev) =>
          prev.map((s) => (s.id === isEditing ? { ...s, ...formData } : s))
        );
      } else {
        await postApiWithAuth('/reports/schedules', formData);
        setSchedules((prev) => [...prev, { ...formData, id: Date.now().toString() } as ScheduledReport]);
      }
      success(isEditing ? L.scheduleUpdated : L.scheduleCreated);
      setFormData({
        name: '',
        frequency: 'daily',
        time: '06:00',
        format: 'pdf',
        recipients: [],
        metrics: [],
        enabled: true,
      });
      setIsAdding(false);
      setIsEditing(null);
    } catch {
      showError(L.scheduleSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }, [formData, isEditing, success, showError, L.requiredFields, L.scheduleUpdated, L.scheduleCreated, L.scheduleSaveFailed]);

  const handleDeleteSchedule = useCallback(
    async (scheduleId: string) => {
      if (!window.confirm(L.deleteScheduleConfirm)) return;

      try {
        setIsSaving(true);
        await postApiWithAuth(`/reports/schedules/${scheduleId}`, { _method: 'DELETE' });
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        success(L.scheduleDeleted);
      } catch {
        showError(L.deleteFailed);
      } finally {
        setIsSaving(false);
      }
    },
    [success, showError, L.deleteScheduleConfirm, L.scheduleDeleted, L.deleteFailed]
  );

  const metrics = ['power_output', 'efficiency', 'availability', 'damage', 'rul', 'vibration'];

  const formatNextRun = useCallback((nextRun: string) => {
    return new Date(nextRun).toLocaleDateString(locale === 'uk' ? 'uk-UA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Active Schedules */}
      <div className="space-y-4">
        {schedules.map((schedule) => (
          <Card
            key={schedule.id}
            className={`p-4 ${schedule.enabled ? 'border-l-green-500 surface-2' : 'border-l-gray-300 surface-2'}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="font-semibold">{schedule.name}</h4>
                <p className="text-xs ink-3 mt-1 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} at {schedule.time}
                  {schedule.frequency === 'weekly' && ` on ${schedule.dayOfWeek}`}
                  {schedule.frequency === 'monthly' && ` on day ${schedule.dayOfMonth}`}
                </p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(e) => {
                    const updated = { ...schedule, enabled: e.target.checked };
                    setSchedules((prev) =>
                      prev.map((s) => (s.id === schedule.id ? updated : s))
                    );
                  }}
                  className="w-4 h-4"
                />
                <span className="text-xs font-medium">{L.enabled}</span>
              </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
              <div>
                <p className="font-medium ink-2">{L.format}</p>
                <p className="ink-3">{schedule.format.toUpperCase()}</p>
              </div>
              <div>
                <p className="font-medium ink-2">{L.recipients}</p>
                <p className="ink-3">{schedule.recipients.length} {L.recipientCount}</p>
              </div>
              <div>
                <p className="font-medium ink-2">{L.metrics}</p>
                <p className="ink-3">{schedule.metrics.length} {L.metricCount}</p>
              </div>
              <div>
                <p className="font-medium ink-2">{L.nextRun}</p>
                <p className="ink-3">{formatNextRun(schedule.nextRun)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFormData(schedule);
                  setIsEditing(schedule.id);
                  setIsAdding(true);
                }}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeleteSchedule(schedule.id)}
                disabled={isSaving}
                className="signal-crit hover:signal-crit"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Schedule Form */}
      {isAdding && (
        <Card className="p-6 surface-2 hairline border">
          <h3 className="font-semibold mb-6">
            {isEditing ? L.editSchedule : L.createSchedule}
          </h3>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium">{L.scheduleName}</label>
              <Input
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Daily Performance Summary"
                className="mt-2"
              />
            </div>

            {/* Frequency */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{L.frequency}</label>
                <select
                  value={formData.frequency || 'daily'}
                  onChange={(e) => handleInputChange('frequency', e.target.value)}
                  className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">{L.time}</label>
                <Input
                  type="time"
                  value={formData.time || '06:00'}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="text-sm font-medium">{L.exportFormat}</label>
              <select
                value={formData.format || 'pdf'}
                onChange={(e) => handleInputChange('format', e.target.value)}
                className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
              </select>
            </div>

            {/* Recipients */}
            <div>
              <label className="text-sm font-medium mb-2 block">{L.emailRecipients}</label>
              <div className="space-y-2">
                {formData.recipients?.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-2 surface-1 border rounded"
                  >
                    <span className="text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {email}
                    </span>
                    <button
                      onClick={() => handleRemoveRecipient(email)}
                      className="signal-crit hover:signal-crit"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddRecipient}
                className="mt-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                {L.addRecipient}
              </Button>
            </div>

            {/* Metrics */}
            <div>
              <label className="text-sm font-medium mb-2 block">{L.metricsInclude}</label>
              <div className="flex flex-wrap gap-2">
                {metrics.map((metric) => (
                  <button
                    key={metric}
                    onClick={() => handleAddMetric(metric)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      formData.metrics?.includes(metric)
                        ? 'bg-blue-600 text-white'
                        : 'surface-1 border hairline ink-2 hover:border-blue-300'
                    }`}
                  >
                    {metric.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setIsEditing(null);
                  setFormData({
                    name: '',
                    frequency: 'daily',
                    time: '06:00',
                    format: 'pdf',
                    recipients: [],
                    metrics: [],
                    enabled: true,
                  });
                }}
              >
                {L.cancel}
              </Button>
              <Button
                onClick={handleSaveSchedule}
                disabled={isSaving}
              >
                {isSaving ? L.saving : L.saveSchedule}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Add Button (if not adding) */}
      {!isAdding && (
        <Button onClick={() => setIsAdding(true)} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          {L.createSchedule}
        </Button>
      )}

      {/* Information */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">{L.automatedTitle}</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Daily Reports:</strong> Generated and sent every day at the specified time.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Weekly Reports:</strong> Generated on the selected day each week. Useful for regular team updates.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Monthly Reports:</strong> Generated on the selected day each month. Commonly used for management summaries.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Multiple Recipients:</strong> Send to multiple email addresses for team distribution.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Enable/Disable:</strong> Toggle schedules on/off without deleting them. Useful for seasonal adjustments.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
