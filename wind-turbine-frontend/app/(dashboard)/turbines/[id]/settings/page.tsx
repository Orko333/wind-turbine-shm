'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTurbineData } from '@/hooks/useTurbineData';
import { patchApiWithAuth, putApiWithAuth, getApiWithAuth, deleteApiWithAuth } from '@/lib/api';
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

function loadLocalSettings(id: string): Partial<SettingsForm> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(settingsKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheLocalSettings(id: string, data: SettingsForm) {
  try {
    localStorage.setItem(settingsKey(id), JSON.stringify(data));
  } catch {
    /* localStorage might be blocked */
  }
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
  const [backendConfig, setBackendConfig] = useState<Partial<SettingsForm> | null>(null);

  // Fetch any user-saved overrides from the backend (namespace: turbine-config).
  useEffect(() => {
    if (!turbineId) return;
    let cancelled = false;
    getApiWithAuth<Partial<SettingsForm>>(`/storage/turbine-config/${turbineId}`)
      .then((data) => {
        if (cancelled) return;
        setBackendConfig(data || {});
      })
      .catch(() => {
        if (cancelled) return;
        // 404 = nothing saved yet; treat as empty so we fall back to defaults.
        setBackendConfig({});
      });
    return () => {
      cancelled = true;
    };
  }, [turbineId]);

  // Build the canonical form values from turbine + backend overrides
  // (preferred) + localStorage (offline fallback).
  const buildFromTurbine = useCallback((): SettingsForm => {
    const local = loadLocalSettings(turbineId) || {};
    const remote = backendConfig || {};
    return {
      tower_height: remote.tower_height ?? local.tower_height ?? turbine?.tower_height ?? 0,
      rotor_diameter: remote.rotor_diameter ?? local.rotor_diameter ?? turbine?.rotor_diameter ?? 0,
      rated_power_kw: remote.rated_power_kw ?? local.rated_power_kw ?? turbine?.rated_power_kw ?? 0,
      material_young_modulus: remote.material_young_modulus ?? local.material_young_modulus ?? DEFAULT_FORM.material_young_modulus,
      material_density: remote.material_density ?? local.material_density ?? DEFAULT_FORM.material_density,
      material_yield_stress: remote.material_yield_stress ?? local.material_yield_stress ?? DEFAULT_FORM.material_yield_stress,
      air_density: remote.air_density ?? local.air_density ?? DEFAULT_FORM.air_density,
      cut_in_speed: remote.cut_in_speed ?? local.cut_in_speed ?? DEFAULT_FORM.cut_in_speed,
      cut_out_speed: remote.cut_out_speed ?? local.cut_out_speed ?? DEFAULT_FORM.cut_out_speed,
    };
  }, [turbineId, turbine, backendConfig]);

  // Sync form when turbine data arrives or turbineId changes
  useEffect(() => {
    if (!turbine || isEditing || backendConfig === null) return;
    setFormData(buildFromTurbine());
  }, [turbine, isEditing, buildFromTurbine, backendConfig]);

  const handleInputChange = useCallback(
    (field: keyof SettingsForm, value: string | number) => {
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
    if (hasValidationErrors) {
      const first = Object.entries(validationErrors)[0];
      if (first) {
        showError(t('turbines.invalid_value', { field: first[0], range: first[1] }));
      }
      return;
    }

    setIsSaving(true);
    try {
      // rated_power_kw has a real backend column — PATCH it. Everything
      // else (tower/rotor geometry, material props, cut-in/out, air
      // density) lives in user_storage under namespace=turbine-config and
      // is merged into /turbines/{id} responses by the backend serializer,
      // so it affects every page that depends on this turbine — not just
      // this Settings view.
      await patchApiWithAuth(`/turbines/${turbineId}`, {
        rated_power_kw: formData.rated_power_kw,
      });
      await putApiWithAuth(`/storage/turbine-config/${turbineId}`, {
        value: formData,
      });
      cacheLocalSettings(turbineId, formData);
      setBackendConfig(formData);
      queryClient.invalidateQueries({ queryKey: ['turbine', turbineId] });
      queryClient.invalidateQueries({ queryKey: ['turbines'] });
      queryClient.invalidateQueries({ queryKey: ['turbine-list'] });
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

  const handleResetDefaults = useCallback(async () => {
    if (!canEdit) {
      showError(t('turbines.no_permission_edit'));
      return;
    }
    if (!confirm(t('turbines.reset_confirm'))) {
      return;
    }
    setIsSaving(true);
    try {
      try {
        await deleteApiWithAuth(`/storage/turbine-config/${turbineId}`);
      } catch {
        /* nothing saved yet — that's fine */
      }
      try {
        localStorage.removeItem(settingsKey(turbineId));
      } catch {
        /* ignore */
      }
      setBackendConfig({});
      queryClient.invalidateQueries({ queryKey: ['turbine', turbineId] });
      queryClient.invalidateQueries({ queryKey: ['turbines'] });
      queryClient.invalidateQueries({ queryKey: ['turbine-list'] });
      success(t('turbines.reset_success'));
      setIsEditing(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSaving(false);
    }
  }, [turbineId, canEdit, showError, success, t, queryClient]);

  // Sanity ranges — must mirror backend _CONFIG_BOUNDS so the UI rejects
  // values that the backend would silently drop.
  const FIELD_RANGES: Record<keyof SettingsForm, [number, number, string]> = {
    tower_height:           [20, 250, 'm'],
    rotor_diameter:         [30, 250, 'm'],
    rated_power_kw:         [100, 20000, 'kW'],
    cut_in_speed:           [0.5, 8, 'm/s'],
    cut_out_speed:          [15, 35, 'm/s'],
    material_young_modulus: [1e4, 5e5, 'MPa'],
    material_density:       [1000, 20000, 'kg/m³'],
    material_yield_stress:  [50, 1500, 'MPa'],
    air_density:            [0.5, 2, 'kg/m³'],
  };

  const validationErrors = useMemo(() => {
    const errors: Partial<Record<keyof SettingsForm, string>> = {};
    (Object.keys(FIELD_RANGES) as Array<keyof SettingsForm>).forEach((key) => {
      const [lo, hi] = FIELD_RANGES[key];
      const v = formData[key];
      if (typeof v !== 'number' || Number.isNaN(v) || v < lo || v > hi) {
        errors[key] = `${lo} – ${hi}`;
      }
    });
    return errors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);
  const hasValidationErrors = Object.keys(validationErrors).length > 0;

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
        <Card className="p-6 surface-2 hairline border space-y-3">
          {hasValidationErrors && (
            <div className="flex items-start gap-2 text-sm signal-crit">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                {t('turbines.invalid_summary')}
                <ul className="mt-1 ink-2 list-disc pl-5">
                  {Object.entries(validationErrors).map(([field, range]) => (
                    <li key={field}>
                      <span className="font-mono">{field}</span>: {range}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
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
                onClick={handleResetDefaults}
                disabled={isSaving}
                title={t('turbines.reset_tooltip')}
              >
                {t('turbines.reset_defaults')}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || hasValidationErrors}
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
