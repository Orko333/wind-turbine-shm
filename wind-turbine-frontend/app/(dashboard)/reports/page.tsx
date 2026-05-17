'use client';

import { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/card';
import { ReportBuilder } from '../../../components/reports/ReportBuilder';
import { TrendingView } from '../../../components/reports/TrendingView';
import { ExportHistory } from '../../../components/reports/ExportHistory';
import { ReportScheduling } from '../../../components/reports/ReportScheduling';
import { FileText, TrendingUp, History, Clock } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { getApiWithAuth } from '@/lib/api';

interface BackendExportRecord {
  id: number;
  file_size_bytes?: number | null;
  exported_at: string;
}
interface BackendSchedule {
  id: number;
  enabled: boolean;
}

type ReportsTab = 'builder' | 'trending' | 'history' | 'scheduling';

export default function ReportsPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ReportsTab>('builder');
  const [stats, setStats] = useState({
    total: 0,
    thisMonth: 0,
    scheduled: 0,
    storageMB: 0,
  });

  useEffect(() => {
    Promise.all([
      getApiWithAuth<BackendExportRecord[]>('/reports/exports').catch(() => []),
      getApiWithAuth<BackendSchedule[]>('/reports/schedules').catch(() => []),
    ]).then(([exports, schedules]) => {
      const now = new Date();
      const thisMonthCount = exports.filter((e) => {
        const d = new Date(e.exported_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
      const totalBytes = exports.reduce((s, e) => s + (e.file_size_bytes || 0), 0);
      setStats({
        total: exports.length,
        thisMonth: thisMonthCount,
        scheduled: schedules.filter((s) => s.enabled).length,
        storageMB: parseFloat((totalBytes / (1024 * 1024)).toFixed(1)),
      });
    });
  }, []);

  const tabs = [
    {
      id: 'builder',
      label: t('reports.tab.builder'),
      icon: FileText,
      description: t('reports.tab.builder_desc'),
      component: ReportBuilder,
    },
    {
      id: 'trending',
      label: t('reports.tab.trending'),
      icon: TrendingUp,
      description: t('reports.tab.trending_desc'),
      component: TrendingView,
    },
    {
      id: 'history',
      label: t('reports.tab.history'),
      icon: History,
      description: t('reports.tab.history_desc'),
      component: ExportHistory,
    },
    {
      id: 'scheduling',
      label: t('reports.tab.scheduling'),
      icon: Clock,
      description: t('reports.tab.scheduling_desc'),
      component: ReportScheduling,
    },
  ];

  const activeTabConfig = tabs.find((t) => t.id === activeTab);
  const Component = activeTabConfig?.component || ReportBuilder;

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 10</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('reports.title_a')} <span className="ink-3">{t('reports.title_b')}</span>
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('reports.body')}
          </p>
        </header>
        <div className="space-y-8 mt-8">

        {/* Tab Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === (tab.id as ReportsTab);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportsTab)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  isActive
                    ? 'border-amber-500 surface-2'
                    : 'hairline surface-1 hover:hairline'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`w-5 h-5 mt-1 flex-shrink-0 ${
                      isActive ? 'signal-live' : 'text-gray-400'
                    }`}
                  />
                  <div className="flex-1">
                    <p className={`font-semibold ${isActive ? 'ink-1' : 'ink-1'}`}>
                      {tab.label}
                    </p>
                    <p className={`text-xs mt-1 ${isActive ? 'ink-2' : 'ink-3'}`}>
                      {tab.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <Component key={activeTab} />

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 surface-2 hairline border">
            <p className="text-sm font-medium signal-live mb-2">{t('reports.total_generated')}</p>
            <p className="text-3xl font-bold ink-1">{stats.total}</p>
            <p className="text-xs ink-2 mt-2">{t('reports.this_month', { n: stats.thisMonth })}</p>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <p className="text-sm font-medium signal-live mb-2">{t('reports.scheduled')}</p>
            <p className="text-3xl font-bold signal-live">{stats.scheduled}</p>
            <p className="text-xs signal-live mt-2">{t('reports.scheduled_freq')}</p>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <p className="text-sm font-medium ink-2 mb-2">{t('reports.storage_used')}</p>
            <p className="text-3xl font-bold ink-1">{stats.storageMB} MB</p>
            <p className="text-xs ink-2 mt-2">{t('reports.storage_avail', { n: '1 GB' })}</p>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <p className="text-sm font-medium signal-warn mb-2">{t('reports.export_formats')}</p>
            <p className="text-3xl font-bold signal-warn">4</p>
            <p className="text-xs text-orange-700 mt-2">{t('reports.export_formats_list')}</p>
          </Card>
        </div>

        {/* Features Overview */}
        <Card className="p-6 surface-2 hairline">
          <h3 className="text-lg font-semibold mb-4">{t('reports.features')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t('reports.custom')}
              </h4>
              <p className="text-xs ink-2">
                {t('reports.custom_desc')}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {t('reports.trend')}
              </h4>
              <p className="text-xs ink-2">
                {t('reports.trend_desc')}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <History className="w-4 h-4" />
                {t('reports.export_mgmt')}
              </h4>
              <p className="text-xs ink-2">
                {t('reports.export_mgmt_desc')}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('reports.automation')}
              </h4>
              <p className="text-xs ink-2">
                {t('reports.automation_desc')}
              </p>
            </div>
          </div>
        </Card>

        {/* Best Practices */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="text-lg font-semibold signal-warn mb-4">{t('reports.best_practices')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm signal-warn">
            <div>
              <p className="font-medium mb-2">{t('reports.bp_gen')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('reports.bp_gen_li1')}</li>
                <li>✓ {t('reports.bp_gen_li2')}</li>
                <li>✓ {t('reports.bp_gen_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('reports.bp_trend')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('reports.bp_trend_li1')}</li>
                <li>✓ {t('reports.bp_trend_li2')}</li>
                <li>✓ {t('reports.bp_trend_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('reports.bp_sched')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('reports.bp_sched_li1')}</li>
                <li>✓ {t('reports.bp_sched_li2')}</li>
                <li>✓ {t('reports.bp_sched_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('reports.bp_storage')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('reports.bp_storage_li1')}</li>
                <li>✓ {t('reports.bp_storage_li2')}</li>
                <li>✓ {t('reports.bp_storage_li3')}</li>
              </ul>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
