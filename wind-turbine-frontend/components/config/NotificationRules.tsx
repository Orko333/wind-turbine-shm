'use client';

import { useState, useCallback } from 'react';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { postApiWithAuth } from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AlertCircle, Lock, Plus, Trash2 } from 'lucide-react';

interface NotificationRule {
  id: string;
  name: string;
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equals' | 'contains';
  threshold: string;
  severity: 'critical' | 'warning' | 'info';
  notification_channels: string[];
  enabled: boolean;
}

export function NotificationRules() {
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const canEdit = canEditConfig();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rules, setRules] = useState<NotificationRule[]>([
    {
      id: '1',
      name: 'Critical Power Loss',
      metric: 'power_output_kw',
      operator: 'less_than',
      threshold: '100',
      severity: 'critical',
      notification_channels: ['email', 'sms'],
      enabled: true,
    },
    {
      id: '2',
      name: 'High Vibration',
      metric: 'vibration_amplitude_mms',
      operator: 'greater_than',
      threshold: '5.0',
      severity: 'warning',
      notification_channels: ['email'],
      enabled: true,
    },
    {
      id: '3',
      name: 'RUL Below Threshold',
      metric: 'remaining_useful_life_months',
      operator: 'less_than',
      threshold: '6',
      severity: 'warning',
      notification_channels: ['email', 'slack'],
      enabled: true,
    },
  ]);

  const [originalRules] = useState<NotificationRule[]>(rules);

  const handleAddRule = useCallback(() => {
    const newRule: NotificationRule = {
      id: Date.now().toString(),
      name: 'New Rule',
      metric: 'power_output_kw',
      operator: 'greater_than',
      threshold: '0',
      severity: 'warning',
      notification_channels: [],
      enabled: true,
    };
    setRules((prev) => [...prev, newRule]);
  }, []);

  const handleRemoveRule = useCallback((ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  const handleRuleChange = useCallback(
    (ruleId: string, field: keyof NotificationRule, value: unknown) => {
      setRules((prev) =>
        prev.map((r) =>
          r.id === ruleId
            ? {
                ...r,
                [field]: value,
              }
            : r
        )
      );
    },
    []
  );

  const handleToggleChannel = useCallback(
    (ruleId: string, channel: string) => {
      setRules((prev) =>
        prev.map((r) =>
          r.id === ruleId
            ? {
                ...r,
                notification_channels: r.notification_channels.includes(channel)
                  ? r.notification_channels.filter((c) => c !== channel)
                  : [...r.notification_channels, channel],
              }
            : r
        )
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) {
      showError('У вас немає прав на редагування правил сповіщень');
      return;
    }

    try {
      setIsSaving(true);
      await postApiWithAuth('/config/notification-rules', { rules });
      success('Правила сповіщень збережено');
      setIsEditing(false);
    } catch (err) {
      showError('Не вдалося зберегти правила сповіщень');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [rules, canEdit, success, showError]);

  const handleCancel = useCallback(() => {
    setRules(originalRules);
    setIsEditing(false);
  }, [originalRules]);

  const channels = ['email', 'sms', 'slack', 'webhook', 'pagerduty'];

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-4 rounded-lg surface-2 border hairline flex gap-3">
          <Lock className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium ink-1">Режим перегляду</p>
            <p className="text-sm ink-2">Тільки адміністратори можуть редагувати правила сповіщень.</p>
          </div>
        </div>
      )}

      {/* Список правил */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">Правила сповіщень</h3>
          <div className="flex gap-2">
            {canEdit && isEditing && (
              <Button size="sm" variant="outline" onClick={handleAddRule}>
                <Plus className="w-4 h-4 mr-2" />
                Додати правило
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant={isEditing ? 'outline' : 'default'}
                onClick={() => setIsEditing(!isEditing)}
                disabled={isSaving}
              >
                {isEditing ? 'Готово' : 'Редагувати правила'}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {rules.length === 0 ? (
            <p className="text-center ink-3 py-8">Правила сповіщень не налаштовані</p>
          ) : (
            rules.map((rule) => (
              <Card
                key={rule.id}
                className="p-4 surface-2 border-l-2 hairline"
                style={{
                  borderLeftColor:
                    rule.severity === 'critical'
                      ? 'hsl(var(--signal-crit))'
                      : rule.severity === 'warning'
                      ? 'hsl(var(--signal-warn))'
                      : 'hsl(var(--signal-live))',
                }}
              >
                <div className="space-y-4">
                  {/* Заголовок правила */}
                  <div className="flex items-start justify-between">
                    {isEditing ? (
                      <Input
                        type="text"
                        value={rule.name}
                        onChange={(e) => handleRuleChange(rule.id, 'name', e.target.value)}
                        className="flex-1 font-semibold"
                      />
                    ) : (
                      <div className="flex-1">
                        <h4 className="font-semibold">{rule.name}</h4>
                        <p className="text-xs ink-3 mt-1">
                          {rule.metric} {rule.operator === 'greater_than' ? '>' : '<'} {rule.threshold}
                        </p>
                      </div>
                    )}

                    {isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveRule(rule.id)}
                        className="signal-crit hover:signal-crit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <>
                      {/* Умова */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-medium">Метрика</label>
                          <select
                            value={rule.metric}
                            onChange={(e) => handleRuleChange(rule.id, 'metric', e.target.value)}
                            className="w-full mt-1 px-2 py-1 surface-2 hairline border rounded text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="power_output_kw">Потужність (kW)</option>
                            <option value="wind_speed_ms">Швидкість вітру (m/s)</option>
                            <option value="vibration_amplitude_mms">Вібрація (mm/s)</option>
                            <option value="remaining_useful_life_months">RUL (місяців)</option>
                            <option value="temperature_celsius">Температура (°C)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium">Умова</label>
                          <select
                            value={rule.operator}
                            onChange={(e) =>
                              handleRuleChange(
                                rule.id,
                                'operator',
                                e.target.value as NotificationRule['operator']
                              )
                            }
                            className="w-full mt-1 px-2 py-1 surface-2 hairline border rounded text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="greater_than">&gt; (більше ніж)</option>
                            <option value="less_than">&lt; (менше ніж)</option>
                            <option value="equals">= (дорівнює)</option>
                            <option value="contains">містить</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium">Поріг</label>
                          <Input
                            type="text"
                            value={rule.threshold}
                            onChange={(e) => handleRuleChange(rule.id, 'threshold', e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {/* Серйозність */}
                      <div>
                        <label className="text-xs font-medium">Серйозність</label>
                        <select
                          value={rule.severity}
                          onChange={(e) =>
                            handleRuleChange(
                              rule.id,
                              'severity',
                              e.target.value as NotificationRule['severity']
                            )
                          }
                          className="w-full mt-1 px-2 py-1 surface-2 hairline border rounded text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="critical">Критична (Червона)</option>
                          <option value="warning">Попередження (Жовта)</option>
                          <option value="info">Інфо (Синя)</option>
                        </select>
                      </div>

                      {/* Канали */}
                      <div>
                        <label className="text-xs font-medium mb-2 block">Канали сповіщень</label>
                        <div className="flex flex-wrap gap-2">
                          {channels.map((channel) => (
                            <label
                              key={channel}
                              className="flex items-center gap-2 px-3 py-1 border rounded text-sm cursor-pointer hover:surface-2"
                            >
                              <input
                                type="checkbox"
                                checked={rule.notification_channels.includes(channel)}
                                onChange={() => handleToggleChannel(rule.id, channel)}
                                className="w-4 h-4"
                              />
                              <span className="capitalize">{channel}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Перемикач увімкнення */}
                      <label className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:surface-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => handleRuleChange(rule.id, 'enabled', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">Правило активне</span>
                      </label>
                    </>
                  )}

                  {/* Режим перегляду */}
                  {!isEditing && (
                    <div className="flex items-center gap-2 text-xs ink-3">
                      <span className="inline-block w-2 h-2 rounded-full bg-current opacity-50" />
                      <span>
                        {channels
                          .filter((c) => rule.notification_channels.includes(c))
                          .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
                          .join(', ')}
                      </span>
                      {!rule.enabled && <span className="text-gray-400">(вимкнено)</span>}
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>

      {/* Кнопки збереження/скасування */}
      {isEditing && (
        <Card className="p-6 surface-2 hairline border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 signal-live" />
              <span className="text-sm ink-1">У вас є незбережені зміни в правилах сповіщень.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Скасувати
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Збереження...' : 'Зберегти правила'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Про правила сповіщень</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Правила:</strong> Визначають умови для будь-якої метрики SCADA, при виконанні яких надсилаються сповіщення.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Рівні серйозності:</strong> Критичні надсилаються завжди; попередження та інфо можна фільтрувати.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Канали:</strong> Підтримуються Email, SMS, Slack, вебхуки та інтеграція з PagerDuty.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Вимкнення:</strong> Можна тимчасово вимкнути правила без їх видалення.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
