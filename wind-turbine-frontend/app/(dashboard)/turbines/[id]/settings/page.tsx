'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTurbineData } from '@/hooks/useTurbineData';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/useToast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Lock } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface SettingsForm {
  tower_height: number;
  rotor_diameter: number;
  rated_power_kw: number;
  material_young_modulus: number;
  material_density: number;
  material_yield_stress: number;
  air_density: number;
  cut_in_speed: number;
  cut_out_speed: number;
}

const DEFAULT_FORM: SettingsForm = {
  tower_height: 0,
  rotor_diameter: 0,
  rated_power_kw: 0,
  material_young_modulus: 210000,
  material_density: 7850,
  material_yield_stress: 250,
  air_density: 1.225,
  cut_in_speed: 3,
  cut_out_speed: 25,
};

function settingsKey(id: string) {
  return `turbine-settings:${id}`;
}

function loadSettings(id: string): Partial<SettingsForm> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(settingsKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(id: string, data: SettingsForm) {
  localStorage.setItem(settingsKey(id), JSON.stringify(data));
}

export default function SettingsPage() {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;
  const { success, error: showError } = useToast();
  const { canEditConfig } = useRole();
  const canEdit = canEditConfig();

  const queryClient = useQueryClient();
  const { turbine, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<SettingsForm>(DEFAULT_FORM);

  // Build the canonical form values from turbine + stored overrides
  const buildFromTurbine = useCallback((): SettingsForm => {
    const stored = loadSettings(turbineId) || {};
    return {
      tower_height: stored.tower_height ?? turbine?.tower_height ?? 0,
      rotor_diameter: stored.rotor_diameter ?? turbine?.rotor_diameter ?? 0,
      rated_power_kw: stored.rated_power_kw ?? turbine?.rated_power_kw ?? 0,
      material_young_modulus: stored.material_young_modulus ?? DEFAULT_FORM.material_young_modulus,
      material_density: stored.material_density ?? DEFAULT_FORM.material_density,
      material_yield_stress: stored.material_yield_stress ?? DEFAULT_FORM.material_yield_stress,
      air_density: stored.air_density ?? DEFAULT_FORM.air_density,
      cut_in_speed: stored.cut_in_speed ?? DEFAULT_FORM.cut_in_speed,
      cut_out_speed: stored.cut_out_speed ?? DEFAULT_FORM.cut_out_speed,
    };
  }, [turbineId, turbine]);

  // Sync form when turbine data arrives or turbineId changes
  useEffect(() => {
    if (!turbine || isEditing) return;
    setFormData(buildFromTurbine());
  }, [turbine, isEditing, buildFromTurbine]);

  const handleInputChange = useCallback(
    (field: keyof SettingsForm, value: string | number) => {
      setFormData((prev) => ({
        ...prev,
        [field]: typeof value === 'string' ? parseFloat(value) || 0 : value,
      }));
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!canEdit) {
      showError(t('turbines.no_permission_edit'));
      return;
    }

    setIsSaving(true);
    try {
      saveSettings(turbineId, formData);
      // Invalidate cached turbine detail so the layout/header and overview KPIs
      // pick up the new overrides (rated power, tower height, rotor diameter).
      queryClient.invalidateQueries({ queryKey: ['turbine', turbineId] });
      success(t('turbines.settings_saved'));
      setIsEditing(false);
    } catch (err) {
      showError(t('turbines.settings_save_failed'));
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [turbineId, formData, canEdit, success, showError, t, queryClient]);

  const handleCancel = useCallback(() => {
    setFormData(buildFromTurbine());
    setIsEditing(false);
  }, [buildFromTurbine]);

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
            <span><strong>{t('turbines.about.params')}</strong> {t('turbines.about.params_desc')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{t('turbines.about.material')}</strong> {t('turbines.about.material_desc')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{t('turbines.about.speeds')}</strong> {t('turbines.about.speeds_desc')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{t('turbines.about.air')}</strong> {t('turbines.about.air_desc')}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
