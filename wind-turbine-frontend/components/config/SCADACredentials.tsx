'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { loadLocal, saveLocal } from '../../lib/localStore';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AlertCircle, Lock, Eye, EyeOff } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

const STORAGE_KEY = 'config:scada-credentials';

interface CredentialsData {
  scada_api_url: string;
  scada_api_key: string;
  scada_api_secret: string;
  websocket_url: string;
  mqtt_broker_url: string;
  mqtt_username: string;
  mqtt_password: string;
  historian_endpoint: string;
  historian_database: string;
  data_fetch_interval_seconds: number;
}

export function SCADACredentials() {
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const { locale } = useLocale();
  const canEdit = canEditConfig();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const defaultData: CredentialsData = {
    scada_api_url: 'https://scada.example.com/api',
    scada_api_key: '',
    scada_api_secret: '',
    websocket_url: 'wss://realtime.example.com/ws',
    mqtt_broker_url: 'mqtt.example.com:1883',
    mqtt_username: '',
    mqtt_password: '',
    historian_endpoint: 'https://historian.example.com',
    historian_database: 'wind_turbines',
    data_fetch_interval_seconds: 60,
  };

  const [formData, setFormData] = useState<CredentialsData>(defaultData);
  const [originalData, setOriginalData] = useState<CredentialsData>(defaultData);

  useEffect(() => {
    const stored = loadLocal<CredentialsData>(STORAGE_KEY);
    if (stored) {
      setFormData({ ...defaultData, ...stored });
      setOriginalData({ ...defaultData, ...stored });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = useCallback(
    (field: keyof CredentialsData, value: string | number) => {
      setFormData((prev) => ({
        ...prev,
        [field]: typeof value === 'string' && field.includes('interval') ? parseInt(value, 10) || 0 : value,
      }));
    },
    []
  );

  const toggleSecretVisibility = useCallback((field: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  }, []);

  const handleSave = useCallback(() => {
    if (!canEdit) {
      showError(locale === 'uk' ? 'У вас немає прав для редагування облікових даних SCADA' : 'You do not have permission to edit SCADA credentials');
      return;
    }

    setIsSaving(true);
    try {
      saveLocal(STORAGE_KEY, formData);
      setOriginalData(formData);
      success(locale === 'uk' ? 'Облікові дані SCADA успішно збережено' : 'SCADA credentials saved successfully');
      setIsEditing(false);
    } catch (err) {
      showError(locale === 'uk' ? 'Не вдалося зберегти облікові дані SCADA' : 'Failed to save SCADA credentials');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, canEdit, success, showError, locale]);

  const handleCancel = useCallback(() => {
    setFormData(originalData);
    setIsEditing(false);
  }, [originalData]);

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-4 rounded-lg surface-2 border hairline flex gap-3">
          <Lock className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium ink-1">{locale === 'uk' ? 'Режим лише для читання' : 'Read-Only Mode'}</p>
            <p className="text-sm ink-2">
              {locale === 'uk' ? 'Лише адміністратори можуть редагувати облікові дані SCADA та API-ключі.' : 'Only administrators can edit SCADA credentials and API keys.'}
            </p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-lg surface-2 border hairline flex gap-3">
        <AlertCircle className="w-5 h-5 signal-crit flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium signal-crit">{locale === 'uk' ? 'Попередження безпеки' : 'Security Notice'}</p>
          <p className="text-sm signal-crit">
            {locale === 'uk' ? 'Облікові дані шифруються при зберіганні. Ніколи не передавайте API-ключі. Регулярно оновлюйте ключі.' : 'Credentials are encrypted at rest. Never share API keys. Rotate keys regularly.'}
          </p>
        </div>
      </div>

      {/* Конфігурація SCADA API */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">{locale === 'uk' ? 'Конфігурація SCADA API' : 'SCADA API Configuration'}</h3>
          {canEdit && (
            <Button
              size="sm"
              variant={isEditing ? 'outline' : 'default'}
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              {isEditing ? (locale === 'uk' ? 'Скасувати редагування' : 'Cancel Editing') : (locale === 'uk' ? 'Редагувати облікові дані' : 'Edit Credentials')}
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {/* URL API */}
          <div>
            <label className="text-sm font-medium">SCADA API URL</label>
            <p className="text-xs ink-3 mt-1">Base URL for SCADA data API</p>
            {isEditing ? (
              <Input
                type="url"
                value={formData.scada_api_url}
                onChange={(e) => handleInputChange('scada_api_url', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">{formData.scada_api_url}</p>
            )}
          </div>

          {/* Ключ API */}
          <div>
            <label className="text-sm font-medium">API Key</label>
            <p className="text-xs ink-3 mt-1">Authentication key for SCADA API</p>
            <div className="flex gap-2 mt-2">
              {isEditing ? (
                <Input
                  type={showSecrets.scada_api_key ? 'text' : 'password'}
                  value={formData.scada_api_key}
                  onChange={(e) => handleInputChange('scada_api_key', e.target.value)}
                  className="flex-1"
                />
              ) : (
                <p className="flex-1 text-sm font-mono ink-2">
                  {formData.scada_api_key
                    ? '•'.repeat(Math.min(formData.scada_api_key.length, 32))
                    : '(not configured)'}
                </p>
              )}
              {isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleSecretVisibility('scada_api_key')}
                >
                  {showSecrets.scada_api_key ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Секрет API */}
          <div>
            <label className="text-sm font-medium">API Secret</label>
            <p className="text-xs ink-3 mt-1">Secret key for SCADA API authentication</p>
            <div className="flex gap-2 mt-2">
              {isEditing ? (
                <Input
                  type={showSecrets.scada_api_secret ? 'text' : 'password'}
                  value={formData.scada_api_secret}
                  onChange={(e) => handleInputChange('scada_api_secret', e.target.value)}
                  className="flex-1"
                />
              ) : (
                <p className="flex-1 text-sm font-mono ink-2">
                  {formData.scada_api_secret
                    ? '•'.repeat(Math.min(formData.scada_api_secret.length, 32))
                    : '(not configured)'}
                </p>
              )}
              {isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleSecretVisibility('scada_api_secret')}
                >
                  {showSecrets.scada_api_secret ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Конфігурація даних реального часу */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">{locale === 'uk' ? 'Конфігурація даних реального часу' : 'Real-Time Data Configuration'}</h3>
        <div className="space-y-6">
          {/* URL WebSocket */}
          <div>
            <label className="text-sm font-medium">WebSocket URL</label>
            <p className="text-xs ink-3 mt-1">Real-time data streaming endpoint</p>
            {isEditing ? (
              <Input
                type="url"
                value={formData.websocket_url}
                onChange={(e) => handleInputChange('websocket_url', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">{formData.websocket_url}</p>
            )}
          </div>

          {/* Брокер MQTT */}
          <div>
            <label className="text-sm font-medium">MQTT Broker URL</label>
            <p className="text-xs ink-3 mt-1">MQTT message broker endpoint</p>
            {isEditing ? (
              <Input
                type="text"
                value={formData.mqtt_broker_url}
                onChange={(e) => handleInputChange('mqtt_broker_url', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">{formData.mqtt_broker_url}</p>
            )}
          </div>

          {/* Ім'я користувача MQTT */}
          <div>
            <label className="text-sm font-medium">MQTT Username</label>
            {isEditing ? (
              <Input
                type="text"
                value={formData.mqtt_username}
                onChange={(e) => handleInputChange('mqtt_username', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">
                {formData.mqtt_username || '(not configured)'}
              </p>
            )}
          </div>

          {/* Пароль MQTT */}
          <div>
            <label className="text-sm font-medium">MQTT Password</label>
            <div className="flex gap-2 mt-2">
              {isEditing ? (
                <Input
                  type={showSecrets.mqtt_password ? 'text' : 'password'}
                  value={formData.mqtt_password}
                  onChange={(e) => handleInputChange('mqtt_password', e.target.value)}
                  className="flex-1"
                />
              ) : (
                <p className="flex-1 text-sm font-mono ink-2">
                  {formData.mqtt_password
                    ? '•'.repeat(Math.min(formData.mqtt_password.length, 32))
                    : '(not configured)'}
                </p>
              )}
              {isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleSecretVisibility('mqtt_password')}
                >
                  {showSecrets.mqtt_password ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Конфігурація сховища даних */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">{locale === 'uk' ? 'Конфігурація зберігання даних' : 'Data Storage Configuration'}</h3>
        <div className="space-y-6">
          {/* Кінцева точка історизатора */}
          <div>
            <label className="text-sm font-medium">Historian Endpoint</label>
            <p className="text-xs ink-3 mt-1">Time-series database server URL</p>
            {isEditing ? (
              <Input
                type="url"
                value={formData.historian_endpoint}
                onChange={(e) => handleInputChange('historian_endpoint', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">{formData.historian_endpoint}</p>
            )}
          </div>

          {/* База даних історизатора */}
          <div>
            <label className="text-sm font-medium">Historian Database Name</label>
            <p className="text-xs ink-3 mt-1">Default database for time-series data</p>
            {isEditing ? (
              <Input
                type="text"
                value={formData.historian_database}
                onChange={(e) => handleInputChange('historian_database', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-sm font-mono ink-2">{formData.historian_database}</p>
            )}
          </div>

          {/* Інтервал отримання даних */}
          <div>
            <label className="text-sm font-medium">Data Fetch Interval (seconds)</label>
            <p className="text-xs ink-3 mt-1">How often to poll SCADA for new data</p>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.data_fetch_interval_seconds}
                onChange={(e) => handleInputChange('data_fetch_interval_seconds', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.data_fetch_interval_seconds}s</p>
            )}
          </div>
        </div>
      </Card>

      {/* Кнопки збереження/скасування */}
      {isEditing && (
        <Card className="p-6 surface-2 hairline border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 signal-live" />
              <span className="text-sm ink-1">
                {locale === 'uk' ? 'У вас є незбережені зміни облікових даних. Перезапустіть сервіси після збереження.' : 'You have unsaved credential changes. Restart services after saving.'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                {locale === 'uk' ? 'Скасувати' : 'Cancel'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (locale === 'uk' ? 'Збереження...' : 'Saving...') : (locale === 'uk' ? 'Зберегти облікові дані' : 'Save Credentials')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">{locale === 'uk' ? 'Про конфігурацію SCADA' : 'About SCADA Configuration'}</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>SCADA API:</strong> Primary HTTP endpoint for polling turbine data.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>WebSocket:</strong> Real-time streaming of SCADA data for live dashboards.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>MQTT:</strong> Lightweight publish-subscribe protocol for distributed data collection.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Historian:</strong> Time-series database for long-term data retention and analytics.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
