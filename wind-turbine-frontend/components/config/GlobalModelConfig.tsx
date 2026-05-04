'use client';

import { useState, useCallback } from 'react';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { postApiWithAuth } from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AlertCircle, Lock } from 'lucide-react';

interface ModelConfigData {
  cnn_confidence_threshold: number;
  lstm_confidence_threshold: number;
  anomaly_detection_threshold: number;
  lstm_forecast_horizon_days: number;
  retraining_interval_days: number;
  min_samples_for_training: number;
  federated_learning_enabled: boolean;
  data_normalization_method: 'minmax' | 'zscore' | 'robust';
}

export function GlobalModelConfig() {
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const canEdit = canEditConfig();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ModelConfigData>({
    cnn_confidence_threshold: 0.7,
    lstm_confidence_threshold: 0.65,
    anomaly_detection_threshold: 0.75,
    lstm_forecast_horizon_days: 30,
    retraining_interval_days: 7,
    min_samples_for_training: 1000,
    federated_learning_enabled: true,
    data_normalization_method: 'zscore',
  });

  const [originalData] = useState<ModelConfigData>(formData);

  const handleInputChange = useCallback(
    (field: keyof ModelConfigData, value: string | number | boolean) => {
      setFormData((prev) => ({
        ...prev,
        [field]:
          typeof value === 'string'
            ? field.includes('threshold') || field.includes('horizon')
              ? parseFloat(value) || 0
              : field.includes('samples')
              ? parseInt(value, 10) || 0
              : value
            : value,
      }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) {
      showError('У вас немає прав на редагування конфігурації моделей');
      return;
    }

    try {
      setIsSaving(true);
      await postApiWithAuth('/config/model-settings', formData);
      success('Конфігурацію моделей збережено');
      setIsEditing(false);
    } catch (err) {
      showError('Не вдалося зберегти конфігурацію моделей');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, canEdit, success, showError]);

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
            <p className="text-sm font-medium ink-1">Режим перегляду</p>
            <p className="text-sm ink-2">Тільки інженери та адміністратори можуть редагувати конфігурацію ML-моделей.</p>
          </div>
        </div>
      )}

      {/* Пороги прогнозування */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">Пороги прогнозування</h3>
          {canEdit && (
            <Button
              size="sm"
              variant={isEditing ? 'outline' : 'default'}
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              {isEditing ? 'Скасувати' : 'Редагувати конфігурацію'}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Достовірність CNN */}
          <div>
            <label className="text-sm font-medium">Поріг достовірності CNN</label>
            <p className="text-xs ink-3 mt-1">0.0 – 1.0, за замовчуванням 0.7</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.cnn_confidence_threshold}
                onChange={(e) => handleInputChange('cnn_confidence_threshold', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">
                {(formData.cnn_confidence_threshold * 100).toFixed(0)}%
              </p>
            )}
          </div>

          {/* Достовірність LSTM */}
          <div>
            <label className="text-sm font-medium">Поріг достовірності LSTM</label>
            <p className="text-xs ink-3 mt-1">0.0 – 1.0, за замовчуванням 0.65</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.lstm_confidence_threshold}
                onChange={(e) => handleInputChange('lstm_confidence_threshold', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">
                {(formData.lstm_confidence_threshold * 100).toFixed(0)}%
              </p>
            )}
          </div>

          {/* Виявлення аномалій */}
          <div>
            <label className="text-sm font-medium">Поріг виявлення аномалій</label>
            <p className="text-xs ink-3 mt-1">Поріг помилки реконструкції</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.anomaly_detection_threshold}
                onChange={(e) => handleInputChange('anomaly_detection_threshold', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">
                {(formData.anomaly_detection_threshold * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Конфігурація навчання */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">Конфігурація навчання</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Горизонт прогнозу */}
          <div>
            <label className="text-sm font-medium">Горизонт прогнозу LSTM (днів)</label>
            <p className="text-xs ink-3 mt-1">На скільки вперед прогнозується RUL</p>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.lstm_forecast_horizon_days}
                onChange={(e) => handleInputChange('lstm_forecast_horizon_days', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.lstm_forecast_horizon_days} днів</p>
            )}
          </div>

          {/* Інтервал перенавчання */}
          <div>
            <label className="text-sm font-medium">Інтервал перенавчання (днів)</label>
            <p className="text-xs ink-3 mt-1">Розклад автоматичного перенавчання моделей</p>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.retraining_interval_days}
                onChange={(e) => handleInputChange('retraining_interval_days', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.retraining_interval_days} днів</p>
            )}
          </div>

          {/* Мінімум зразків */}
          <div>
            <label className="text-sm font-medium">Мін. кількість зразків для навчання</label>
            <p className="text-xs ink-3 mt-1">Мінімальна кількість точок даних</p>
            {isEditing ? (
              <Input
                type="number"
                step="100"
                value={formData.min_samples_for_training}
                onChange={(e) => handleInputChange('min_samples_for_training', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.min_samples_for_training}</p>
            )}
          </div>

          {/* Нормалізація даних */}
          <div>
            <label className="text-sm font-medium">Метод нормалізації даних</label>
            <p className="text-xs ink-3 mt-1">Метод масштабування ознак</p>
            {isEditing ? (
              <select
                value={formData.data_normalization_method}
                onChange={(e) =>
                  handleInputChange(
                    'data_normalization_method',
                    e.target.value as 'minmax' | 'zscore' | 'robust'
                  )
                }
                className="mt-2 w-full px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="minmax">Масштабування Min-Max</option>
                <option value="zscore">Нормалізація Z-Score</option>
                <option value="robust">Робастне масштабування</option>
              </select>
            ) : (
              <p className="mt-2 text-lg font-semibold">
                {formData.data_normalization_method === 'minmax'
                  ? 'Min-Max'
                  : formData.data_normalization_method === 'zscore'
                  ? 'Z-Score'
                  : 'Робастне'}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Розширені налаштування */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">Додаткові налаштування</h3>
        <div>
          <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:surface-2">
            <input
              type="checkbox"
              checked={formData.federated_learning_enabled}
              onChange={(e) => handleInputChange('federated_learning_enabled', e.target.checked)}
              disabled={!isEditing}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <p className="font-medium text-sm">Увімкнути федеративне навчання</p>
              <p className="text-xs ink-3">Дозволяє спільне навчання на кількох вітропарках з збереженням приватності даних</p>
            </div>
          </label>
        </div>
      </Card>

      {/* Кнопки збереження/скасування */}
      {isEditing && (
        <Card className="p-6 surface-2 hairline border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 signal-live" />
              <span className="text-sm ink-1">У вас є незбережені зміни. Ці налаштування впливають на всі прогнози ML-моделей.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Скасувати
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Збереження...' : 'Зберегти конфігурацію'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Про конфігурацію ML-моделей</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Пороги достовірності:</strong> Вищі значення суворіші; прогнози нижче порогу потребують ручної перевірки.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Горизонт прогнозу:</strong> Визначає, на скільки місяців вперед LSTM прогнозує зміни RUL.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Інтервал перенавчання:</strong> Моделі автоматично перенавчаються за цим розкладом з новими даними.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Федеративне навчання:</strong> Спільне навчання на кількох парках з дотриманням конфіденційності даних.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
