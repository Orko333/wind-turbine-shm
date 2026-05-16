'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { LSTMPrediction } from '@/components/ml/LSTMPrediction';
import { CNNClassification } from '@/components/ml/CNNClassification';
import { AnomalyDetection } from '@/components/ml/AnomalyDetection';
import { SHAPExplanation } from '@/components/ml/SHAPExplanation';
import { FederatedStatus } from '@/components/ml/FederatedStatus';
import { useTurbineList } from '@/hooks/useTurbineData';
import { useT } from '@/lib/i18n';

export default function MLPage() {
  const t = useT();
  const [refreshKey, setRefreshKey] = useState(0);

  // Pull the first turbine of the user as the demo target for ML inference,
  // because turbine_ids are user-prefixed (e.g. ADMI-001), not "WT-001".
  const { turbines } = useTurbineList({ page: 1, pageSize: 1, enabled: true });
  const demoTurbineId = turbines?.[0]?.turbine_id;

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-6 pt-8 pb-6 border-b hairline">
        <p className="eyebrow ink-4 mb-2">РОЗДІЛ · 05</p>
        <h1 className="display ink-1">
          Машинне <span className="ink-4">навчання.</span>
        </h1>
        <p className="body-lg ink-3 mt-4 max-w-2xl">
          Прогнозування залишкового ресурсу, класифікація пошкоджень CNN, виявлення аномалій
          та пояснюваність моделей на основі SHAP-аналізу.
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Toolbar */}
        <Card className="p-4 surface-2 hairline">
          <div className="flex items-center justify-between">
            <p className="text-sm ink-3">
              Моделі завантажені · Інференс на основі реальних даних телеметрії
            </p>
            <Button variant="outline" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Оновити моделі
            </Button>
          </div>
        </Card>

        {/* LSTM + CNN row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <LSTMPrediction key={`lstm-${refreshKey}-${demoTurbineId}`} turbineId={demoTurbineId} />
          <CNNClassification key={`cnn-${refreshKey}-${demoTurbineId}`} turbineId={demoTurbineId} />
        </div>

        {/* Anomaly Detection */}
        <AnomalyDetection key={`anomaly-${refreshKey}-${demoTurbineId}`} turbineId={demoTurbineId} />

        {/* SHAP Explanation */}
        <SHAPExplanation key={`shap-${refreshKey}-${demoTurbineId}`} turbineId={demoTurbineId} />

        {/* Federated Learning Status */}
        <FederatedStatus key={`federated-${refreshKey}`} />
      </div>
    </div>
  );
}
