'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '../../hooks/useToast';
import { Clock, Plus, Edit2, Trash2, Mail } from 'lucide-react';
import { useLocale } from '../../lib/i18n';
import { getApiWithAuth, postApiWithAuth, patchApiWithAuth, deleteApiWithAuth } from '../../lib/api';

interface BackendSchedule {
  id: string;
  name: string;
  frequency: string;
  day_of_week: string | null;
  day_of_month: number | null;
  time: string;
  format: string;
  recipients: string[];
  metrics: string[];
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

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
    freqDaily: 'Daily',
    freqWeekly: 'Weekly',
    freqMonthly: 'Monthly',
    freqQuarterly: 'Quarterly',
    atTime: 'at',
    onWeekday: 'on',
    onDayOfMonth: 'on day',
    excelFormat: 'Excel',
    namePlaceholder: 'e.g., Daily Performance Summary',
    bulletDaily: 'Daily Reports',
    bulletDailyDesc: 'Generated and sent every day at the specified time.',
    bulletWeekly: 'Weekly Reports',
    bulletWeeklyDesc: 'Generated on the selected day each week. Useful for regular team updates.',
    bulletMonthly: 'Monthly Reports',
    bulletMonthlyDesc: 'Generated on the selected day each month. Commonly used for management summaries.',
    bulletMulti: 'Multiple Recipients',
    bulletMultiDesc: 'Send to multiple email addresses for team distribution.',
    bulletToggle: 'Enable/Disable',
    bulletToggleDesc: 'Toggle schedules on/off without deleting them. Useful for seasonal adjustments.',
    metricPower: 'Power Output',
    metricEfficiency: 'Efficiency',
    metricAvailability: 'Availability',
    metricDamage: 'Damage',
    metricRul: 'RUL',
    metricVibration: 'Vibration',
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
    freqDaily: 'Щодня',
    freqWeekly: 'Щотижня',
    freqMonthly: 'Щомісяця',
    freqQuarterly: 'Щокварталу',
    atTime: 'о',
    onWeekday: ',',
    onDayOfMonth: ', день',
    excelFormat: 'Excel',
    namePlaceholder: 'напр., Щоденний звіт продуктивності',
    bulletDaily: 'Щоденні звіти',
    bulletDailyDesc: 'Генеруються та надсилаються щодня у вказаний час.',
    bulletWeekly: 'Щотижневі звіти',
    bulletWeeklyDesc: 'Генеруються у вибраний день тижня. Корисно для регулярних оновлень команди.',
    bulletMonthly: 'Щомісячні звіти',
    bulletMonthlyDesc: 'Генеруються у вибраний день місяця. Зазвичай для підсумків керівництва.',
    bulletMulti: 'Кілька отримувачів',
    bulletMultiDesc: 'Надсилання на кілька email-адрес для розсилки команді.',
    bulletToggle: 'Увімкнути/Вимкнути',
    bulletToggleDesc: 'Вмикайте/вимикайте розклади без видалення. Корисно для сезонних коригувань.',
    metricPower: 'Вихідна потужність',
    metricEfficiency: 'Ефективність',
    metricAvailability: 'Доступність',
    metricDamage: 'Пошкодження',
    metricRul: 'RUL',
    metricVibration: 'Вібрація',
  },
} as const;

export function ReportScheduling() {
  const { success, error: showError } = useToast();
  const { locale } = useLocale();
  const L = UI_TEXT[locale];
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);

  // Load from backend on mount
  useEffect(() => {
    getApiWithAuth<BackendSchedule[]>('/reports/schedules')
      .then((rows) => {
        setSchedules(
          rows.map((b) => ({
            id: b.id,
            name: b.name,
            frequency: b.frequency as ScheduledReport['frequency'],
            dayOfWeek: b.day_of_week || undefined,
            dayOfMonth: b.day_of_month || undefined,
            time: b.time,
            format: b.format as ScheduledReport['format'],
            recipients: b.recipients,
            metrics: b.metrics,
            enabled: b.enabled,
            lastRun: b.last_run || undefined,
            nextRun: b.next_run || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }))
        );
      })
      .catch((err) => console.error('Load schedules failed:', err));
  }, []);

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

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        frequency: formData.frequency,
        day_of_week: formData.dayOfWeek,
        day_of_month: formData.dayOfMonth,
        time: formData.time,
        format: formData.format,
        recipients: formData.recipients || [],
        metrics: formData.metrics || [],
        enabled: formData.enabled ?? true,
      };
      let saved: BackendSchedule;
      if (isEditing) {
        saved = await patchApiWithAuth<BackendSchedule>(`/reports/schedules/${isEditing}`, payload);
      } else {
        saved = await postApiWithAuth<BackendSchedule>('/reports/schedules', payload);
      }
      const mapped: ScheduledReport = {
        id: saved.id,
        name: saved.name,
        frequency: saved.frequency as ScheduledReport['frequency'],
        dayOfWeek: saved.day_of_week || undefined,
        dayOfMonth: saved.day_of_month || undefined,
        time: saved.time,
        format: saved.format as ScheduledReport['format'],
        recipients: saved.recipients,
        metrics: saved.metrics,
        enabled: saved.enabled,
        nextRun: saved.next_run || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      setSchedules((prev) => {
        if (isEditing) return prev.map((s) => (s.id === isEditing ? mapped : s));
        return [...prev, mapped];
      });
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
    } catch (err) {
      showError(err instanceof Error ? err.message : L.scheduleSaveFailed);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, isEditing, success, showError, L.requiredFields, L.scheduleUpdated, L.scheduleCreated, L.scheduleSaveFailed]);

  const handleDeleteSchedule = useCallback(
    async (scheduleId: string) => {
      setIsSaving(true);
      try {
        await deleteApiWithAuth(`/reports/schedules/${scheduleId}`);
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        success(L.scheduleDeleted);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Delete failed');
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    },
    [success, showError, L.scheduleDeleted]
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
            className={`p-4 border-l-2 surface-2 ${schedule.enabled ? '' : 'opacity-60'}`}
            style={schedule.enabled ? { borderLeftColor: 'hsl(var(--signal-live))' } : { borderLeftColor: 'hsl(var(--ink-3))' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="font-semibold">{schedule.name}</h4>
                <p className="text-xs ink-3 mt-1 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {(
                    schedule.frequency === 'daily' ? L.freqDaily :
                    schedule.frequency === 'weekly' ? L.freqWeekly :
                    schedule.frequency === 'monthly' ? L.freqMonthly :
                    L.freqQuarterly
                  )} {L.atTime} {schedule.time}
                  {schedule.frequency === 'weekly' && ` ${L.onWeekday} ${schedule.dayOfWeek}`}
                  {schedule.frequency === 'monthly' && ` ${L.onDayOfMonth} ${schedule.dayOfMonth}`}
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
                placeholder={L.namePlaceholder}
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
                  className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="daily">{L.freqDaily}</option>
                  <option value="weekly">{L.freqWeekly}</option>
                  <option value="monthly">{L.freqMonthly}</option>
                  <option value="quarterly">{L.freqQuarterly}</option>
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
                className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="pdf">PDF</option>
                <option value="xlsx">{L.excelFormat}</option>
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
                {metrics.map((metric) => {
                  const metricLabel: Record<string, string> = {
                    power_output: L.metricPower,
                    efficiency: L.metricEfficiency,
                    availability: L.metricAvailability,
                    damage: L.metricDamage,
                    rul: L.metricRul,
                    vibration: L.metricVibration,
                  };
                  return (
                    <button
                      key={metric}
                      onClick={() => handleAddMetric(metric)}
                      className={`px-3 py-1 rounded text-xs font-medium mono uppercase tracking-widest transition-colors border hairline ${
                        formData.metrics?.includes(metric)
                          ? 'glow-amber surface-2 ink-1'
                          : 'surface-1 ink-2 hover:surface-2'
                      }`}
                    >
                      {metricLabel[metric] ?? metric}
                    </button>
                  );
                })}
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
            <span><strong>{L.bulletDaily}:</strong> {L.bulletDailyDesc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.bulletWeekly}:</strong> {L.bulletWeeklyDesc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.bulletMonthly}:</strong> {L.bulletMonthlyDesc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.bulletMulti}:</strong> {L.bulletMultiDesc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.bulletToggle}:</strong> {L.bulletToggleDesc}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
