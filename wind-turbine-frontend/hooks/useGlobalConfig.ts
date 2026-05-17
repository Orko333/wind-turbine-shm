'use client';

import { useEffect, useState } from 'react';
import { fetchUserStorage } from '@/lib/userStorage';

export interface GlobalTurbineSettings {
  air_density: number;
  gravity: number;
  safety_factor: number;
  design_life_years: number;
  inspection_interval_months: number;
}

export interface GlobalModelSettings {
  cnn_confidence_threshold: number;
  lstm_confidence_threshold: number;
  anomaly_detection_threshold: number;
  lstm_forecast_horizon_days: number;
  retraining_interval_days: number;
  min_samples_for_training: number;
  federated_learning_enabled: boolean;
  data_normalization_method: 'minmax' | 'zscore' | 'robust';
}

const TURBINE_DEFAULTS: GlobalTurbineSettings = {
  air_density: 1.225,
  gravity: 9.81,
  safety_factor: 1.35,
  design_life_years: 20,
  inspection_interval_months: 12,
};

const MODEL_DEFAULTS: GlobalModelSettings = {
  cnn_confidence_threshold: 0.7,
  lstm_confidence_threshold: 0.65,
  anomaly_detection_threshold: 0.75,
  lstm_forecast_horizon_days: 30,
  retraining_interval_days: 7,
  min_samples_for_training: 1000,
  federated_learning_enabled: true,
  data_normalization_method: 'zscore',
};

export function useGlobalConfig() {
  const [turbineSettings, setTurbineSettings] = useState<GlobalTurbineSettings>(TURBINE_DEFAULTS);
  const [modelSettings, setModelSettings] = useState<GlobalModelSettings>(MODEL_DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchUserStorage<GlobalTurbineSettings>('config', 'turbine-settings'),
      fetchUserStorage<GlobalModelSettings>('config', 'model-settings'),
    ]).then(([ts, ms]) => {
      if (ts) setTurbineSettings({ ...TURBINE_DEFAULTS, ...ts });
      if (ms) setModelSettings({ ...MODEL_DEFAULTS, ...ms });
      setIsLoaded(true);
    });
  }, []);

  return { turbineSettings, modelSettings, isLoaded };
}
