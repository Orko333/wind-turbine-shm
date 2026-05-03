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

type ModelType = '2.5MW' | '3.0MW';

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

const mockPhysicsData: Record<ModelType, PhysicsData> = {
  '2.5MW': {
    powerCurve: [
      { wind_speed: 3.5, power: 0 },
      { wind_speed: 4, power: 50 },
      { wind_speed: 5, power: 150 },
      { wind_speed: 6, power: 300 },
      { wind_speed: 7, power: 520 },
      { wind_speed: 8, power: 800 },
      { wind_speed: 9, power: 1200 },
      { wind_speed: 10, power: 1600 },
      { wind_speed: 11, power: 2100 },
      { wind_speed: 12, power: 2400 },
      { wind_speed: 12.5, power: 2500 },
      { wind_speed: 13, power: 2500 },
      { wind_speed: 25, power: 2500 },
    ],
    windShear: Array.from({ length: 20 }, (_, i) => ({
      height: 10 + i * 7,
      wind_speed: 10 * Math.pow((10 + i * 7) / 10, 0.25),
    })),
    thrustMoment: Array.from({ length: 45 }, (_, i) => {
      const windSpeed = 3 + i * 0.5;
      let thrust, moment;

      if (windSpeed < 3.5) {
        thrust = 0;
        moment = 0;
      } else if (windSpeed < 12.5) {
        const cp = 0.48 * ((windSpeed - 3.5) / 9);
        const rotorArea = 7234; // m² for 96m diameter
        const rho = 1.225;
        thrust = (0.5 * rho * rotorArea * cp * windSpeed * windSpeed) / 1000;
        moment = thrust * (96 / 2 / 1000);
      } else if (windSpeed < 25) {
        thrust = 900 + (windSpeed - 12.5) * 50;
        moment = thrust * (96 / 2 / 1000);
      } else {
        thrust = 0;
        moment = 0;
      }

      return {
        wind_speed: windSpeed,
        thrust_kn: Math.max(0, thrust),
        moment_knm: Math.max(0, moment),
      };
    }),
    offshoreLoading: {
      wave_height: 2.5,
      current_speed: 0.45,
      water_depth: 32,
      total_load: 1250,
    },
    windFarm: [
      { x: 300, y: 150, turbine_id: 'T1', wind_speed: 10 },
      { x: 500, y: 150, turbine_id: 'T2', wind_speed: 9.2 },
      { x: 700, y: 150, turbine_id: 'T3', wind_speed: 8.8 },
      { x: 300, y: 300, turbine_id: 'T4', wind_speed: 9.8 },
      { x: 500, y: 300, turbine_id: 'T5', wind_speed: 8.9 },
      { x: 700, y: 300, turbine_id: 'T6', wind_speed: 8.5 },
      { x: 300, y: 450, turbine_id: 'T7', wind_speed: 9.5 },
      { x: 500, y: 450, turbine_id: 'T8', wind_speed: 8.7 },
      { x: 700, y: 450, turbine_id: 'T9', wind_speed: 8.2 },
    ],
  },
  '3.0MW': {
    powerCurve: [
      { wind_speed: 3.5, power: 0 },
      { wind_speed: 4, power: 60 },
      { wind_speed: 5, power: 180 },
      { wind_speed: 6, power: 360 },
      { wind_speed: 7, power: 630 },
      { wind_speed: 8, power: 960 },
      { wind_speed: 9, power: 1440 },
      { wind_speed: 10, power: 1920 },
      { wind_speed: 11, power: 2520 },
      { wind_speed: 12, power: 2880 },
      { wind_speed: 12.5, power: 3000 },
      { wind_speed: 13, power: 3000 },
      { wind_speed: 25, power: 3000 },
    ],
    windShear: Array.from({ length: 20 }, (_, i) => ({
      height: 10 + i * 7,
      wind_speed: 10 * Math.pow((10 + i * 7) / 10, 0.25),
    })),
    thrustMoment: Array.from({ length: 45 }, (_, i) => {
      const windSpeed = 3 + i * 0.5;
      let thrust, moment;

      if (windSpeed < 3.5) {
        thrust = 0;
        moment = 0;
      } else if (windSpeed < 12.5) {
        const cp = 0.48 * ((windSpeed - 3.5) / 9);
        const rotorArea = 9852; // m² for 112m diameter
        const rho = 1.225;
        thrust = (0.5 * rho * rotorArea * cp * windSpeed * windSpeed) / 1000;
        moment = thrust * (112 / 2 / 1000);
      } else if (windSpeed < 25) {
        thrust = 1050 + (windSpeed - 12.5) * 60;
        moment = thrust * (112 / 2 / 1000);
      } else {
        thrust = 0;
        moment = 0;
      }

      return {
        wind_speed: windSpeed,
        thrust_kn: Math.max(0, thrust),
        moment_knm: Math.max(0, moment),
      };
    }),
    offshoreLoading: {
      wave_height: 3.0,
      current_speed: 0.55,
      water_depth: 35,
      total_load: 1450,
    },
    windFarm: [
      { x: 300, y: 150, turbine_id: 'T1', wind_speed: 10.2 },
      { x: 520, y: 150, turbine_id: 'T2', wind_speed: 9.4 },
      { x: 740, y: 150, turbine_id: 'T3', wind_speed: 9 },
      { x: 300, y: 320, turbine_id: 'T4', wind_speed: 10 },
      { x: 520, y: 320, turbine_id: 'T5', wind_speed: 9.2 },
      { x: 740, y: 320, turbine_id: 'T6', wind_speed: 8.7 },
      { x: 300, y: 490, turbine_id: 'T7', wind_speed: 9.7 },
      { x: 520, y: 490, turbine_id: 'T8', wind_speed: 8.9 },
      { x: 740, y: 490, turbine_id: 'T9', wind_speed: 8.4 },
    ],
  },
};

export default function PhysicsPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [selectedModel, setSelectedModel] = useState<ModelType>('2.5MW');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [windDirection, setWindDirection] = useState(270);
  const [data, setData] = useState<PhysicsData>(mockPhysicsData['2.5MW']);

  // Load дані when model changes
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Simulate API call - in production, fetch from backend
        // const response = await getApiWithAuth<PhysicsData>(
        //   `/physics/${selectedModel}`
        // );
        // setData(response);

        // Use mock дані for now
        setData(mockPhysicsData[selectedModel]);
        success(t('physics.loaded_data', { model: selectedModel }));
      } catch (err) {
        showError(t('physics.load_failed'));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedModel, success, showError, t]);

  // Export дані as CSV
  const handleExportData = useCallback(async () => {
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
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      success(t('physics.refreshed'));
    }, 500);
  }, [success, t]);

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
              <p className="font-medium text-cyan-900 mb-3">{t('physics.model_3_0_mw')}</p>
              <ul className="space-y-2 text-sm text-cyan-800">
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
