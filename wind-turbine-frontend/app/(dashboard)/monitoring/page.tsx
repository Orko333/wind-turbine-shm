'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Activity } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { OMAAnalysis } from '@/components/monitoring/OMAAnalysis';
import { BladeMonitoring } from '@/components/monitoring/BladeMonitoring';
import { GeodeticMonitoring } from '@/components/monitoring/GeodeticMonitoring';
import { Spectrogram } from '@/components/monitoring/Spectrogram';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { useT } from '@/lib/i18n';

export default function MonitoringPage() {
  const t = useT();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  // Initialize
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        // Simulate loading delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        success('Сторінку моніторингу завантажено');
        setIsLoading(false);
      } catch (err) {
        showError('Failed to load monitoring data');
        console.error(err);
        setIsLoading(false);
      }
    };

    initializeData();
  }, [success, showError]);

  // WebSocket for real-time дані
  useEffect(() => {
    if (!isRealtime) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/monitoring/stream`;

      wsRef.current = new ReconnectingWebSocket(wsUrl, [], {
        maxReconnectionDelay: 5000,
        minReconnectionDelay: 1000,
      });

      wsRef.current.onopen = () => {
        success('Підключено до моніторингу в реальному часі');
      };

      wsRef.current.onmessage = (event) => {
        try {
          JSON.parse(event.data);
          // Оновити дані based on received повідомлення
          // This would оновити component state
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    } catch (err) {
      console.error('Failed to connect to WebSocket:', err);
      setIsRealtime(false);
    }
  }, [isRealtime, success]);

  // Export дані
  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        sections: {
          omaAnalysis: 'OMA data exported',
          bladeMonitoring: 'Експорт даних стану лопатей',
          geodeticMonitoring: 'Експорт даних осідання фундаменту',
          spectrogram: 'Експорт даних спектру вібрацій',
        },
      };

      const csvContent = generateMonitoringCSV(exportData);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `shm-monitoring-${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      success('Дані моніторингу експортовано');
    } catch (err) {
      showError('Failed to export data');
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  }, [success, showError]);

  // Refresh дані
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      success('Дані оновлено');
    }, 500);
  }, [success]);

  // Toggle real-time monitoring
  const toggleRealtime = useCallback(() => {
    setIsRealtime((prev) => !prev);
  }, []);

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">

        {/* Header */}
        <header className="pb-10 hairline-b">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">{t('common.section')} · 06</p>
              <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
                {t('monitoring.title_a')} <span className="ink-3">{t('monitoring.title_b')}</span>
              </h1>
              <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
                {t('monitoring.body')}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="eyebrow">{t('common.status')}</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full surface-1 hairline border ${isRealtime ? 'glow-live' : ''}`}>
                <div className={`relative w-1.5 h-1.5 rounded-full ${isRealtime ? 'bg-live' : 'bg-[hsl(var(--ink-4))]'}`}>
                  {isRealtime && <span className="absolute inset-0 rounded-full bg-live opacity-50 animate-ping" />}
                </div>
                <span className={`mono text-[10px] tracking-widest ${isRealtime ? 'signal-live' : 'ink-3'}`}>
                  {isRealtime ? t('common.streaming') : t('common.idle')}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Control Bar */}
        <div className="flex items-center justify-between py-6 hairline-b">
          <div className="mono text-[11px] ink-3">
            <span className="eyebrow mr-3">{t('monitoring.last_update')}</span>
            <span className="ink-2 tabular" suppressHydrationWarning>{new Date().toLocaleTimeString()}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 surface-1 hairline border rounded mono text-[11px] tracking-widest ink-2 hover:ink-1 transition-colors uppercase disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>

            <button
              onClick={toggleRealtime}
              className={`flex items-center gap-2 px-3 py-1.5 hairline border rounded mono text-[11px] tracking-widest transition-colors uppercase ${
                isRealtime ? 'surface-2 ink-1 border-[hsl(var(--ink-3))]' : 'surface-1 ink-2 hover:ink-1'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {isRealtime ? t('monitoring.stop_stream') : t('monitoring.start_stream')}
            </button>

            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-1.5 rounded mono text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? t('common.exporting') : t('common.export')}
            </button>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-12 mt-10">
          <OMAAnalysis selectedMode={1} isLoading={isLoading} />
          <Spectrogram isLoading={isLoading} />
          <BladeMonitoring isLoading={isLoading} />
          <GeodeticMonitoring isLoading={isLoading} />
        </div>

        {/* Methodology */}
        <section className="mt-16 pt-10 hairline-t">
          <header className="mb-6">
            <p className="eyebrow">{t('monitoring.cap.eyebrow')}</p>
            <h3 className="display text-2xl ink-1 mt-1">{t('monitoring.cap.title')}</h3>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {[
              { key: 'I',   t: t('monitoring.cap.real_t'),   d: t('monitoring.cap.real_d') },
              { key: 'II',  t: t('monitoring.cap.hist_t'),   d: t('monitoring.cap.hist_d') },
              { key: 'III', t: t('monitoring.cap.status_t'), d: t('monitoring.cap.status_d') },
              { key: 'IV',  t: t('monitoring.cap.resp_t'),   d: t('monitoring.cap.resp_d') },
            ].map((m) => (
              <div key={m.key}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="mono text-[10px] tracking-widest signal-warn tabular">§ {m.key}</span>
                  <span className="text-sm font-semibold ink-1 tracking-tight">{m.t}</span>
                </div>
                <p className="text-sm ink-3 leading-relaxed text-pretty">{m.d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// Helper function to generate CSV export
function generateMonitoringCSV(_data: unknown): string {
  const lines: string[] = [];

  lines.push('SHM Monitoring System Export');
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('MONITORING SECTIONS');
  lines.push('1. Operational Modal Analysis (OMA)');
  lines.push('   - Natural frequencies');
  lines.push('   - Damping ratios');
  lines.push('   - Mode shapes');
  lines.push('');

  lines.push('2. Vibration Spectrogram');
  lines.push('   - Frequency spectrum');
  lines.push('   - Peak frequencies and powers');
  lines.push('   - Time-frequency evolution');
  lines.push('');

  lines.push('3. Blade Condition Monitoring');
  lines.push('   - Erosion percentage');
  lines.push('   - Ice accretion percentage');
  lines.push('   - Mass imbalance percentage');
  lines.push('');

  lines.push('4. Geodetic Monitoring');
  lines.push('   - Foundation settlement');
  lines.push('   - Settlement trend (36 months)');
  lines.push('   - Tilt angle and direction');
  lines.push('   - Stability assessment');
  lines.push('');

  lines.push('FEATURES');
  lines.push('- Real-time data via WebSocket');
  lines.push('- Historical trends and analytics');
  lines.push('- Status badges and health indicators');
  lines.push('- Mobile responsive interface');
  lines.push('- Data export functionality');

  return lines.join('\n');
}
