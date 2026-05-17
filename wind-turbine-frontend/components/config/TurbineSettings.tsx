'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { fetchUserStorage, saveUserStorage } from '../../lib/userStorage';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AlertCircle, Lock } from 'lucide-react';

const NS = 'config';
const KEY = 'turbine-settings';

interface TurbineSettingsData {
  air_density: number;
  gravity: number;
  safety_factor: number;
  design_life_years: number;
  inspection_interval_months: number;
}

export function TurbineSettings() {
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const canEdit = canEditConfig();

  const defaultData: TurbineSettingsData = {
    air_density: 1.225,
    gravity: 9.81,
    safety_factor: 1.35,
    design_life_years: 20,
    inspection_interval_months: 12,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<TurbineSettingsData>(defaultData);
  const [originalData, setOriginalData] = useState<TurbineSettingsData>(defaultData);

  useEffect(() => {
    fetchUserStorage<TurbineSettingsData>(NS, KEY).then((stored) => {
      if (stored) {
        setFormData({ ...defaultData, ...stored });
        setOriginalData({ ...defaultData, ...stored });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = useCallback(
    (field: keyof TurbineSettingsData, value: string | number) => {
      setFormData((prev) => ({
        ...prev,
        [field]: typeof value === 'string' ? parseFloat(value) || 0 : value,
      }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) {
      showError('У вас немає прав на редагування налаштувань турбін');
      return;
    }

    setIsSaving(true);
    try {
      await saveUserStorage(NS, KEY, formData);
      setOriginalData(formData);
      success('Налаштування турбін збережено');
      setIsEditing(false);
    } catch (err) {
      showError('Не вдалося зберегти налаштування турбін');
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
            <p className="text-sm ink-2">Тільки інженери та адміністратори можуть редагувати налаштування турбін.</p>
          </div>
        </div>
      )}

      {/* Параметри середовища */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">Параметри середовища</h3>
          {canEdit && (
            <Button
              size="sm"
              variant={isEditing ? 'outline' : 'default'}
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              {isEditing ? 'Скасувати' : 'Редагувати параметри'}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Густина повітря */}
          <div>
            <label className="text-sm font-medium">Густина повітря (kg/m³)</label>
            <p className="text-xs ink-3 mt-1">Стандарт на рівні моря: 1.225</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                value={formData.air_density}
                onChange={(e) => handleInputChange('air_density', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.air_density} kg/m³</p>
            )}
          </div>

          {/* Гравітація */}
          <div>
            <label className="text-sm font-medium">Прискорення вільного падіння (m/s²)</label>
            <p className="text-xs ink-3 mt-1">Стандарт: 9.81</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                value={formData.gravity}
                onChange={(e) => handleInputChange('gravity', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.gravity} m/s²</p>
            )}
          </div>
        </div>
      </Card>

      {/* Параметри проектування */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">Параметри проектування</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Коефіцієнт безпеки */}
          <div>
            <label className="text-sm font-medium">Коефіцієнт запасу</label>
            <p className="text-xs ink-3 mt-1">Зазвичай 1.35 за IEC 61400-1</p>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                value={formData.safety_factor}
                onChange={(e) => handleInputChange('safety_factor', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.safety_factor}</p>
            )}
          </div>

          {/* Термін служби */}
          <div>
            <label className="text-sm font-medium">Проектний строк служби (років)</label>
            <p className="text-xs ink-3 mt-1">Очікуваний термін служби турбіни</p>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.design_life_years}
                onChange={(e) => handleInputChange('design_life_years', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.design_life_years} років</p>
            )}
          </div>

          {/* Інтервал інспекції */}
          <div>
            <label className="text-sm font-medium">Інтервал інспекцій (місяців)</label>
            <p className="text-xs ink-3 mt-1">Інтервал технічного обслуговування</p>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.inspection_interval_months}
                onChange={(e) => handleInputChange('inspection_interval_months', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.inspection_interval_months} місяців</p>
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
              <span className="text-sm ink-1">У вас є незбережені зміни. Ці налаштування застосовуються до всіх турбін.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Скасувати
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Збереження...' : 'Зберегти налаштування'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Про глобальні налаштування турбін</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Густина повітря:</strong> Впливає на криву потужності та розрахунки навантажень. Змінюється з висотою і температурою.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Коефіцієнт запасу:</strong> Застосовується до всіх розрахункових навантажень згідно з IEC 61400-1.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Проектний строк:</strong> Використовується для розрахунку втоми та оцінки RUL. Стандарт — 20 років.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Інтервал інспекцій:</strong> Рекомендований регламент ТО. Система позначить турбіни, що потребують інспекції.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
