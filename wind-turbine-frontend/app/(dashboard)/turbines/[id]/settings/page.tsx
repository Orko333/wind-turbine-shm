'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useTurbineData } from '@/hooks/useTurbineData';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/useToast';
import { postApiWithAuth } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Lock } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function SettingsPage() {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const canEdit = canEditConfig();

  const { turbine, isLoading, refetch } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    tower_height: turbine?.tower_height || 0,
    rotor_diameter: turbine?.rotor_diameter || 0,
    rated_power_kw: turbine?.rated_power_kw || 0,
    material_young_modulus: 210000, // Default steel value in MPa
    material_density: 7850, // kg/m3
    material_yield_stress: 250, // MPa
    air_density: 1.225, // kg/m3
    cut_in_speed: 3, // m/s
    cut_out_speed: 25, // m/s
  });

  // Оновити form дані when turbine loads
  const handleInputChange = useCallback(
    (field: string, value: string | number) => {
      setFormData((prev) => ({
        ...prev,
        [field]: typeof value === 'string' ? parseFloat(value) || 0 : value,
      }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) {
      showError(t('turbines.no_permission_edit'));
      return;
    }

    try {
      setIsSaving(true);
      await postApiWithAuth(`/turbines/${turbineId}/settings`, formData);
      success(t('turbines.settings_saved'));
      await refetch();
      setIsEditing(false);
    } catch (err) {
      showError(t('turbines.settings_save_failed'));
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [turbineId, formData, canEdit, success, showError, refetch, t]);

  const handleCancel = useCallback(() => {
    setFormData({
      tower_height: turbine?.tower_height || 0,
      rotor_diameter: turbine?.rotor_diameter || 0,
      rated_power_kw: turbine?.rated_power_kw || 0,
      material_young_modulus: 210000,
      material_density: 7850,
      material_yield_stress: 250,
      air_density: 1.225,
      cut_in_speed: 3,
      cut_out_speed: 25,
    });
    setIsEditing(false);
  }, [turbine]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!turbine) {
    return (
      <div className="rounded-lg surface-2 border hairline p-6">
        <p className="signal-crit">{t('turbines.not_found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-4 rounded-lg surface-2 border hairline flex gap-3">
          <Lock className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium ink-1">{t('turbines.read_only')}</p>
            <p className="text-sm ink-2">
              {t('turbines.read_only_desc')}
            </p>
          </div>
        </div>
      )}

      {/* Turbine Parameters */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">{t('turbines.parameters')}</h3>
          {canEdit && (
            <Button
              size="sm"
              variant={isEditing ? 'outline' : 'default'}
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              {isEditing ? t('turbines.cancel_editing') : t('turbines.edit_parameters')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tower Height */}
          <div>
            <label className="text-sm font-medium">{t('turbines.tower_height')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="0.1"
                value={formData.tower_height}
                onChange={(e) => handleInputChange('tower_height', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.tower_height} m</p>
            )}
          </div>

          {/* Rotor Diameter */}
          <div>
            <label className="text-sm font-medium">{t('turbines.rotor_diameter')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="0.1"
                value={formData.rotor_diameter}
                onChange={(e) => handleInputChange('rotor_diameter', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.rotor_diameter} m</p>
            )}
          </div>

          {/* Rated Power */}
          <div>
            <label className="text-sm font-medium">{t('turbines.rated_power')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.rated_power_kw}
                onChange={(e) => handleInputChange('rated_power_kw', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.rated_power_kw} kW</p>
            )}
          </div>

          {/* Cut-in Speed */}
          <div>
            <label className="text-sm font-medium">{t('turbines.cut_in_speed')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="0.1"
                value={formData.cut_in_speed}
                onChange={(e) => handleInputChange('cut_in_speed', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.cut_in_speed} m/s</p>
            )}
          </div>

          {/* Cut-out Speed */}
          <div>
            <label className="text-sm font-medium">{t('turbines.cut_out_speed')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="0.1"
                value={formData.cut_out_speed}
                onChange={(e) => handleInputChange('cut_out_speed', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.cut_out_speed} m/s</p>
            )}
          </div>
        </div>
      </Card>

      {/* Material Properties */}
      <Card className="p-6">
        <h3 className="font-semibold mb-6">{t('turbines.material_props')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Young's Modulus */}
          <div>
            <label className="text-sm font-medium">{t('turbines.young_modulus')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="100"
                value={formData.material_young_modulus}
                onChange={(e) => handleInputChange('material_young_modulus', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.material_young_modulus} MPa</p>
            )}
          </div>

          {/* Density */}
          <div>
            <label className="text-sm font-medium">{t('turbines.density')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.material_density}
                onChange={(e) => handleInputChange('material_density', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.material_density} kg/m³</p>
            )}
          </div>

          {/* Yield Stress */}
          <div>
            <label className="text-sm font-medium">{t('turbines.yield_stress')}</label>
            {isEditing ? (
              <Input
                type="number"
                step="1"
                value={formData.material_yield_stress}
                onChange={(e) => handleInputChange('material_yield_stress', e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-lg font-semibold">{formData.material_yield_stress} MPa</p>
            )}
          </div>

          {/* Air Density */}
          <div>
            <label className="text-sm font-medium">{t('turbines.air_density')}</label>
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
        </div>
      </Card>

      {/* Save/Cancel Buttons */}
      {isEditing && (
        <Card className="p-6 surface-2 hairline border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 signal-live" />
              <span className="text-sm ink-1">
                {t('turbines.unsaved_changes')}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? t('turbines.saving') : t('turbines.save_settings')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Additional Information */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">{t('turbines.about_settings')}</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Параметри турбіни:</strong> Визначають основні фізичні характеристики та експлуатаційні обмеження.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Властивості матеріалу:</strong> Задають механічні характеристики конструкційного матеріалу вежі та інших елементів.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Швидкості вмикання/вимкнення:</strong> Швидкость вітру, при якій турбіна починає і зупиняє роботу для максимізації виробництва енергії.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              <strong>Щільність повітря:</strong> Впливає на розрахунок потужності; залежить від висоти та температури. За замовчуванням — рівень моря при 15°C.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
