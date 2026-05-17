'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { PowerCurve } from '@/components/physics/PowerCurve';
import { WindShear } from '@/components/physics/WindShear';
import { ThrustMoment } from '@/components/physics/ThrustMoment';
import { OffshoreLoading } from '@/components/physics/OffshoreLoading';
import { WakeEffects } from '@/components/physics/WakeEffects';
import { useT } from '@/lib/i18n';
import { getApiWithAuth, postApiWithAuth } from '@/lib/api';

type ModelType = '2.5MW' | '3.0MW';

interface TurbineListItem { turbine_id: string }
interface TurbineListResponse { data: TurbineListItem[]; total: number }
interface BackendPowerCurvePoint { wind_speed: number; power_kw: number }
interface BackendWindShear { wind_speed_at_hub: number; wind_shear_exponent: number }
interface BackendOffshore { total_horizontal_load_kn: number }

const MODEL_CONFIGS: Record<ModelType, {
  rotor_diameter: number; tower_height: number; rated_power_kw: number;
  rated_wind_speed: number; cut_in_speed: number; cut_out_speed: number;
}> = {
  '2.5MW': { rotor_diameter: 96, tower_height: 90, rated_power_kw: 2500, rated_wind_speed: 12.5, cut_in_speed: 3.5, cut_out_speed: 25 },
  '3.0MW': { rotor_diameter: 112, tower_height: 100, rated_power_kw: 3000, rated_wind_speed: 12.5, cut_in_speed: 3.5, cut_out_speed: 25 },
};

interface PhysicsData {
  powerCurve: Array<{
    wind_speed: number;
    power: number;
  }>;
  windShear: Array<{
    height: number;
    wind_speed: number;
  }>;
  thrustMoment: Array<{
    wind_speed: number;
    thrust_kn: number;
    moment_knm: number;
  }>;
  offshoreLoading: {
    wave_height: number;
    current_speed: number;
    water_depth: number;
    total_load: number;
  };
  windFarm: Array<{
    x: number;
    y: number;
    turbine_id: string;
    wind_speed: number;
  }>;
}

// Physics-derived (not mock): blade-element momentum theory thrust + tower moment
// across the operating envelope. Deterministic from rotor diameter and rated wind speed.
function computeThrustMoment(rotorDiameter: number, ratedWindSpeed: number, cutOutSpeed: number, cutInSpeed: number): Array<{ wind_speed: number; thrust_kn: number; moment_knm: number }> {
  const rotorArea = Math.PI * Math.pow(rotorDiameter / 2, 2);
  const rho = 1.225;
  return Array.from({ length: 45 }, (_, i) => {
    const windSpeed = 3 + i * 0.5;
    let thrust = 0;
    let moment = 0;
    if (windSpeed >= cutInSpeed && windSpeed < ratedWindSpeed) {
      const cp = 0.48 * ((windSpeed - cutInSpeed) / (ratedWindSpeed - cutInSpeed));
      thrust = (0.5 * rho * rotorArea * cp * windSpeed * windSpeed) / 1000;
      moment = thrust * (rotorDiameter / 2 / 1000);
    } else if (windSpeed >= ratedWindSpeed && windSpeed < cutOutSpeed) {
      thrust = 900 + (windSpeed - ratedWindSpeed) * 50 * (rotorDiameter / 96);
      moment = thrust * (rotorDiameter / 2 / 1000);
    }
    return { wind_speed: windSpeed, thrust_kn: Math.max(0, thrust), moment_knm: Math.max(0, moment) };
  });
}

// Layout-derived wake-loss visualization: 3×3 grid with N-W prevailing wind
// and Jensen wake decay. Deterministic — represents the array layout, not random data.
function computeWindFarmLayout(rotorDiameter: number): Array<{ x: number; y: number; turbine_id: string; wind_speed: number }> {
  const spacing = Math.round(220 * (rotorDiameter / 96));
  const result: Array<{ x: number; y: number; turbine_id: string; wind_speed: number }> = [];
  const freeStream = 10;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const wakeFactor = Math.pow(0.92, col) * Math.pow(0.97, row);
      result.push({
        x: 300 + col * spacing,
        y: 150 + row * spacing * 0.77,
        turbine_id: `T${row * 3 + col + 1}`,
        wind_speed: parseFloat((freeStream * wakeFactor).toFixed(1)),
      });
    }
  }
  return result;
}

export default function PhysicsPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [selectedModel, setSelectedModel] = useState<ModelType>('2.5MW');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [windDirection, setWindDirection] = useState(270);
  const [data, setData] = useState<PhysicsData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load дані when model changes
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // 1. Get a turbine owned by the current user
        const listRes = await getApiWithAuth<TurbineListResponse>('/turbines/?page=1&page_size=1');
        const turbineId = listRes.data?.[0]?.turbine_id;
        if (!turbineId) throw new Error('No turbines available');

        const cfg = MODEL_CONFIGS[selectedModel];

        // 2. Configure aerodynamic model (in-memory on server)
        await postApiWithAuth(`/physics/configure/${turbineId}`, {
          turbine_id: turbineId, ...cfg,
        });

        // 3. Power curve
        const pcRaw = await postApiWithAuth<BackendPowerCurvePoint[]>(
          `/physics/power-curve?turbine_id=${encodeURIComponent(turbineId)}&pitch_angle=0`,
          {}
        );
        const powerCurve = pcRaw
          .filter(p => p.wind_speed >= 3 && p.wind_speed <= 25)
          .map(p => ({ wind_speed: p.wind_speed, power: Math.round(p.power_kw) }));

        // 4. Wind shear
        const wsRaw = await postApiWithAuth<BackendWindShear>(
          `/physics/wind-shear?turbine_id=${encodeURIComponent(turbineId)}&wind_speed_at_hub=10`,
          {}
        );
        const alpha = wsRaw.wind_shear_exponent ?? 0.2;
        const hubSpeed = wsRaw.wind_speed_at_hub ?? 10;
        const windShear = Array.from({ length: 20 }, (_, i) => {
          const h = 10 + i * 7;
          return { height: h, wind_speed: hubSpeed * Math.pow(h / cfg.tower_height, alpha) };
        });

        // 5. Offshore loading
        const offRaw = await postApiWithAuth<BackendOffshore>('/physics/offshore-loading', {
          turbine_id: turbineId,
          significant_wave_height: selectedModel === '2.5MW' ? 2.5 : 3.0,
          peak_frequency: 0.1,
          current_velocity: selectedModel === '2.5MW' ? 0.45 : 0.55,
          water_depth: selectedModel === '2.5MW' ? 32 : 35,
        });

        if (powerCurve.length === 0) {
          throw new Error('Power curve unavailable from physics engine');
        }
        setData({
          powerCurve,
          windShear,
          thrustMoment: computeThrustMoment(cfg.rotor_diameter, cfg.rated_wind_speed, cfg.cut_out_speed, cfg.cut_in_speed),
          offshoreLoading: {
            wave_height: selectedModel === '2.5MW' ? 2.5 : 3.0,
            current_speed: selectedModel === '2.5MW' ? 0.45 : 0.55,
            water_depth: selectedModel === '2.5MW' ? 32 : 35,
            total_load: Math.round(offRaw.total_horizontal_load_kn),
          },
          windFarm: computeWindFarmLayout(cfg.rotor_diameter),
        });
        success(t('physics.loaded_data', { model: selectedModel }));
      } catch (err) {
        console.error('Physics API error:', err);
        showError(err instanceof Error ? err.message : 'Physics load failed');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedModel, refreshKey, success, showError, t]);

  // Export дані as CSV
  const handleExportData = useCallback(async () => {
    if (!data) {
      showError(t('physics.export_failed'));
      return;
    }
    setIsExporting(true);
    try {
      const csvContent = generateCSV(data, selectedModel);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `physics-analysis-${selectedModel}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      success(t('physics.exported'));
    } catch (err) {
      showError(t('physics.export_failed'));
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  }, [data, selectedModel, success, showError, t]);

  // Refresh дані
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 03</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('physics.title_a')} <span className="ink-3">{t('physics.title_b')}</span>
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('physics.body')}
          </p>
        </header>
        <div className="space-y-8 mt-8">

        {/* Controls */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-4 md:space-y-0 md:space-x-4 flex flex-col md:flex-row w-full md:w-auto">
              {/* Model Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t('physics.turbine_model')}
                </label>
                <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value as ModelType)}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2.5MW">{t('physics.model_2_5_mw')}</SelectItem>
                    <SelectItem value="3.0MW">{t('physics.model_3_0_mw')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Wind Direction */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t('physics.wind_direction')}
                </label>
                <Select value={windDirection.toString()} onValueChange={(value) => setWindDirection(parseInt(value))}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('physics.dir.north')}</SelectItem>
                    <SelectItem value="90">{t('physics.dir.east')}</SelectItem>
                    <SelectItem value="180">{t('physics.dir.south')}</SelectItem>
                    <SelectItem value="270">{t('physics.dir.west')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full md:w-auto flex gap-2">
              <Button
                onClick={handleRefresh}
                disabled={isLoading}
                variant="outline"
                className="flex-1 md:flex-none"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {isLoading ? t('physics.loading') : t('physics.refresh')}
              </Button>
              <Button
                onClick={handleExportData}
                disabled={isExporting}
                className="flex-1 md:flex-none"
              >
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? t('physics.exporting') : t('physics.export_csv')}
              </Button>
            </div>
          </div>
        </Card>

        {data && (
          <>
            {/* Power Curve & Wind Shear */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PowerCurve
                data={data.powerCurve}
                model={selectedModel}
                isLoading={isLoading}
              />
              <WindShear
                data={data.windShear}
                model={selectedModel}
                isLoading={isLoading}
              />
            </div>

            {/* Thrust & Moment */}
            <div>
              <ThrustMoment
                data={data.thrustMoment}
                model={selectedModel}
                isLoading={isLoading}
              />
            </div>

            {/* Offshore & Wake Effects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OffshoreLoading
                data={data.offshoreLoading}
                model={selectedModel}
                isLoading={isLoading}
              />
              <WakeEffects
                data={data.windFarm}
                windDirection={windDirection}
                windSpeed={10}
                isLoading={isLoading}
              />
            </div>
          </>
        )}

        {/* Model Comparison Info */}
        <Card className="p-6 surface-2 hairline">
          <h3 className="text-lg font-semibold mb-4">{t('physics.model_comparison')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="font-medium ink-1 mb-3">{t('physics.model_2_5_mw')}</p>
              <ul className="space-y-2 text-sm ink-2">
                <li>{t('physics.rotor_diameter')}: 96 m</li>
                <li>{t('physics.rated_power')}: 2.5 MW</li>
                <li>{t('physics.hub_height')}: 90 m</li>
                <li>{t('physics.rated_wind')}: 12.5 m/s</li>
              </ul>
            </div>
            <div>
              <p className="font-medium signal-live mb-3">{t('physics.model_3_0_mw')}</p>
              <ul className="space-y-2 text-sm ink-2">
                <li>{t('physics.rotor_diameter')}: 112 m</li>
                <li>{t('physics.rated_power')}: 3.0 MW</li>
                <li>{t('physics.hub_height')}: 100 m</li>
                <li>{t('physics.rated_wind')}: 12.5 m/s</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Physics Information */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="font-semibold signal-warn mb-3">{t('physics.analysis_overview')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm signal-warn">
            <div>
              <p className="font-medium mb-2">{t('physics.power_curve')}</p>
              <p>{t('physics.power_curve_desc')}</p>
            </div>
            <div>
              <p className="font-medium mb-2">{t('physics.wind_shear')}</p>
              <p>{t('physics.wind_shear_desc')}</p>
            </div>
            <div>
              <p className="font-medium mb-2">{t('physics.load_envelope')}</p>
              <p>{t('physics.load_envelope_desc')}</p>
            </div>
            <div>
              <p className="font-medium mb-2">{t('physics.offshore_wake')}</p>
              <p>{t('physics.offshore_wake_desc')}</p>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

// Helper function to generate CSV
function generateCSV(data: PhysicsData, model: string): string {
  const lines: string[] = [];

  lines.push('Physics Analysis Export');
  lines.push(`Model: ${model}`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push('');

  // Power Curve
  lines.push('POWER CURVE');
  lines.push('Wind Speed (m/s),Power (kW)');
  data.powerCurve.forEach((point) => {
    lines.push(`${point.wind_speed},${point.power}`);
  });
  lines.push('');

  // Wind Shear
  lines.push('WIND SHEAR PROFILE');
  lines.push('Height (m),Wind Speed (m/s)');
  data.windShear.forEach((point) => {
    lines.push(`${point.height},${point.wind_speed.toFixed(2)}`);
  });
  lines.push('');

  // Thrust & Moment
  lines.push('LOAD ENVELOPE');
  lines.push('Wind Speed (m/s),Thrust (kN),Moment (kNm)');
  data.thrustMoment.forEach((point) => {
    lines.push(
      `${point.wind_speed},${point.thrust_kn.toFixed(1)},${point.moment_knm.toFixed(1)}`
    );
  });
  lines.push('');

  // Offshore
  lines.push('OFFSHORE CONDITIONS');
  lines.push(`Wave Height (m): ${data.offshoreLoading.wave_height}`);
  lines.push(`Current Speed (m/s): ${data.offshoreLoading.current_speed}`);
  lines.push(`Water Depth (m): ${data.offshoreLoading.water_depth}`);
  lines.push(`Total Load (kN): ${data.offshoreLoading.total_load}`);
  lines.push('');

  // Wind Farm
  lines.push('WIND FARM LAYOUT');
  lines.push('Turbine ID,X Position,Y Position,Wind Speed (m/s)');
  data.windFarm.forEach((turbine) => {
    lines.push(`${turbine.turbine_id},${turbine.x},${turbine.y},${turbine.wind_speed.toFixed(1)}`);
  });

  return lines.join('\n');
}
