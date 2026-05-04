'use client';

import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { TurbineSettings } from '../../../components/config/TurbineSettings';
import { GlobalModelConfig } from '../../../components/config/GlobalModelConfig';
import { SCADACredentials } from '../../../components/config/SCADACredentials';
import { NotificationRules } from '../../../components/config/NotificationRules';
import { Settings, Cpu, Wifi, Bell } from 'lucide-react';
import { useT } from '@/lib/i18n';

type ConfigTab = 'turbine' | 'model' | 'scada' | 'notifications';

export default function ConfigPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ConfigTab>('turbine');

  const tabs = [
    {
      id: 'turbine',
      label: t('config.tab.turbine'),
      icon: Settings,
      description: t('config.tab.turbine_desc'),
      component: TurbineSettings,
    },
    {
      id: 'model',
      label: t('config.tab.model'),
      icon: Cpu,
      description: t('config.tab.model_desc'),
      component: GlobalModelConfig,
    },
    {
      id: 'scada',
      label: t('config.tab.scada'),
      icon: Wifi,
      description: t('config.tab.scada_desc'),
      component: SCADACredentials,
    },
    {
      id: 'notifications',
      label: t('config.tab.notifications'),
      icon: Bell,
      description: t('config.tab.notifications_desc'),
      component: NotificationRules,
    },
  ];

  const activeTabConfig = tabs.find((t) => t.id === activeTab);
  const Component = activeTabConfig?.component || TurbineSettings;

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 09</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('config.title_a')} <span className="ink-3">{t('config.title_b')}</span>
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('config.body')}
          </p>
        </header>
        <div className="space-y-8 mt-8">

        {/* Tab Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === (tab.id as ConfigTab);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ConfigTab)}
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

        {/* Configuration Guide */}
        <Card className="p-6 surface-2 hairline">
          <h3 className="text-lg font-semibold mb-4">{t('config.guide')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {t('config.tab.turbine')}
              </h4>
              <p className="text-xs ink-2">{t('config.guide_turbine_desc')}</p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                {t('config.tab.model')}
              </h4>
              <p className="text-xs ink-2">{t('config.guide_model_desc')}</p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                {t('config.tab.scada')}
              </h4>
              <p className="text-xs ink-2">{t('config.guide_scada_desc')}</p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                {t('config.tab.notifications')}
              </h4>
              <p className="text-xs ink-2">{t('config.guide_notif_desc')}</p>
            </div>
          </div>
        </Card>

        {/* Best Practices */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="text-lg font-semibold signal-warn mb-4">{t('config.best_practices')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm signal-warn">
            <div>
              <p className="font-medium mb-2">{t('config.bp_system')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('config.bp_system_li1')}</li>
                <li>✓ {t('config.bp_system_li2')}</li>
                <li>✓ {t('config.bp_system_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('config.bp_ml')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('config.bp_ml_li1')}</li>
                <li>✓ {t('config.bp_ml_li2')}</li>
                <li>✓ {t('config.bp_ml_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('config.bp_data')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('config.bp_data_li1')}</li>
                <li>✓ {t('config.bp_data_li2')}</li>
                <li>✓ {t('config.bp_data_li3')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">{t('config.bp_alerts')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>✓ {t('config.bp_alerts_li1')}</li>
                <li>✓ {t('config.bp_alerts_li2')}</li>
                <li>✓ {t('config.bp_alerts_li3')}</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Troubleshooting */}
        <Card className="p-6 hairline">
          <h3 className="text-lg font-semibold mb-4">{t('config.troubleshoot')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <p className="font-medium mb-3 ink-1">{t('config.ts_data')}</p>
              <ul className="space-y-2 ink-2 text-xs">
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_data_li1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_data_li2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_data_li3')}</span>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3 ink-1">{t('config.ts_alerts')}</p>
              <ul className="space-y-2 ink-2 text-xs">
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_alerts_li1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_alerts_li2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_alerts_li3')}</span>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3 ink-1">{t('config.ts_ml')}</p>
              <ul className="space-y-2 ink-2 text-xs">
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_ml_li1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_ml_li2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_ml_li3')}</span>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3 ink-1">{t('config.ts_changes')}</p>
              <ul className="space-y-2 ink-2 text-xs">
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_changes_li1')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_changes_li2')}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">→</span>
                  <span>{t('config.ts_changes_li3')}</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
