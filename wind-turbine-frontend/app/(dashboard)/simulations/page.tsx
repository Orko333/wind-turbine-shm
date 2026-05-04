'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { OpenFASTRunner } from '@/components/simulations/OpenFASTRunner';
import { ROMStressAnalysis } from '@/components/simulations/ROMStressAnalysis';
import { DynamicSimulation } from '@/components/simulations/DynamicSimulation';
import { Zap, Waves, Wind } from 'lucide-react';
import { useT } from '@/lib/i18n';

type SimulationType = 'openfast' | 'rom' | 'dynamic';

export default function SimulationsPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<SimulationType>('openfast');

  const tabs = [
    {
      id: 'openfast',
      label: t('simulations.tab.openfast'),
      icon: Zap,
      description: t('simulations.tab.openfast_desc'),
      component: OpenFASTRunner,
    },
    {
      id: 'rom',
      label: t('simulations.tab.rom'),
      icon: Waves,
      description: t('simulations.tab.rom_desc'),
      component: ROMStressAnalysis,
    },
    {
      id: 'dynamic',
      label: t('simulations.tab.dynamic'),
      icon: Wind,
      description: t('simulations.tab.dynamic_desc'),
      component: DynamicSimulation,
    },
  ];

  const activeTabConfig = tabs.find((t) => t.id === activeTab);
  const Component = activeTabConfig?.component || OpenFASTRunner;

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 08</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('simulations.title')}
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('simulations.body')}
          </p>
        </header>
        <div className="space-y-8 mt-8">

        {/* Tab Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SimulationType)}
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

        {/* Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 surface-2 hairline border">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold ink-1 mb-2">{t('simulations.results_caching')}</h4>
                <p className="text-sm ink-2">
                  {t('simulations.results_caching_desc')}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <div className="flex items-start gap-3">
              <Wind className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold signal-live mb-2">{t('simulations.fallback')}</h4>
                <p className="text-sm signal-live">
                  {t('simulations.fallback_desc')}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <div className="flex items-start gap-3">
              <Waves className="w-5 h-5 ink-2 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold ink-1 mb-2">{t('simulations.export_options')}</h4>
                <p className="text-sm ink-2">
                  {t('simulations.export_options_desc')}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* About Each Simulation */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="text-lg font-semibold mb-6">{t('simulations.methods')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold ink-1 mb-3">{t('simulations.tab.openfast')}</h4>
              <ul className="text-sm ink-2 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="signal-warn font-bold">•</span>
                  <span>{t('simulations.openfast_li1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-warn font-bold">•</span>
                  <span>{t('simulations.openfast_li2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-warn font-bold">•</span>
                  <span>{t('simulations.openfast_li3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-warn font-bold">•</span>
                  <span>{t('simulations.openfast_li4')}</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold ink-1 mb-3">{t('simulations.rom_title')}</h4>
              <ul className="text-sm ink-2 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="signal-live font-bold">•</span>
                  <span>{t('simulations.rom_li1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-live font-bold">•</span>
                  <span>{t('simulations.rom_li2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-live font-bold">•</span>
                  <span>{t('simulations.rom_li3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="signal-live font-bold">•</span>
                  <span>{t('simulations.rom_li4')}</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold ink-1 mb-3">{t('simulations.dynamic_title')}</h4>
              <ul className="text-sm ink-2 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="ink-2 font-bold">•</span>
                  <span>{t('simulations.dynamic_li1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="ink-2 font-bold">•</span>
                  <span>{t('simulations.dynamic_li2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="ink-2 font-bold">•</span>
                  <span>{t('simulations.dynamic_li3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="ink-2 font-bold">•</span>
                  <span>{t('simulations.dynamic_li4')}</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Best Practices */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="text-lg font-semibold signal-warn mb-4">{t('simulations.best_practices')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm signal-warn">
            <div>
              <p className="font-medium mb-2">{t('simulations.bp_openfast')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>{t('simulations.bp_openfast_li1')}</li>
                <li>{t('simulations.bp_openfast_li2')}</li>
                <li>{t('simulations.bp_openfast_li3')}</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2">{t('simulations.bp_rom')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>{t('simulations.bp_rom_li1')}</li>
                <li>{t('simulations.bp_rom_li2')}</li>
                <li>{t('simulations.bp_rom_li3')}</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2">{t('simulations.bp_dynamic')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>{t('simulations.bp_dynamic_li1')}</li>
                <li>{t('simulations.bp_dynamic_li2')}</li>
                <li>{t('simulations.bp_dynamic_li3')}</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2">{t('simulations.bp_general')}</p>
              <ul className="space-y-1 text-xs ml-4">
                <li>{t('simulations.bp_general_li1')}</li>
                <li>{t('simulations.bp_general_li2')}</li>
                <li>{t('simulations.bp_general_li3')}</li>
              </ul>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
