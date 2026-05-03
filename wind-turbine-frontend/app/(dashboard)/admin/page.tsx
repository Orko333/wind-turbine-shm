'use client';

import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { UserManagement } from '../../../components/admin/UserManagement';
import { RolesPermissions } from '../../../components/admin/RolesPermissions';
import { AuditLogs } from '../../../components/admin/AuditLogs';
import { SystemHealth } from '../../../components/admin/SystemHealth';
import { Users, Lock, FileText, Activity } from 'lucide-react';
import { useT } from '@/lib/i18n';

type AdminTab = 'users' | 'roles' | 'audit' | 'health';

export default function AdminPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const tabs = [
    {
      id: 'users',
      label: t('admin.tab.users'),
      icon: Users,
      description: t('admin.tab.users_desc'),
      component: UserManagement,
    },
    {
      id: 'roles',
      label: t('admin.tab.roles'),
      icon: Lock,
      description: t('admin.tab.roles_desc'),
      component: RolesPermissions,
    },
    {
      id: 'audit',
      label: t('admin.tab.audit'),
      icon: FileText,
      description: t('admin.tab.audit_desc'),
      component: AuditLogs,
    },
    {
      id: 'health',
      label: t('admin.tab.health'),
      icon: Activity,
      description: t('admin.tab.health_desc'),
      component: SystemHealth,
    },
  ];

  const activeTabConfig = tabs.find((t) => t.id === activeTab);
  const Component = activeTabConfig?.component || UserManagement;

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10">
      <div className="max-w-[1600px] mx-auto">
        <header className="pb-10 hairline-b">
          <p className="eyebrow">{t('common.section')} · 11</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.5rem)] ink-1 mt-3 leading-[0.95]">
            {t('admin.title_a')} <span className="ink-3">{t('admin.title_b')}</span>
          </h1>
          <p className="text-base ink-3 mt-5 max-w-2xl text-pretty leading-relaxed">
            {t('admin.body')}
          </p>
        </header>
        <div className="space-y-8 mt-8">

        {/* Tab Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === (tab.id as AdminTab);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`relative p-4 rounded-lg border text-left transition-all ${
                  isActive
                    ? 'surface-2 hairline border-l-2 glow-amber'
                    : 'hairline surface-1 hover:surface-2'
                }`}
                style={isActive ? { borderLeftColor: 'hsl(var(--primary))' } : undefined}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`w-5 h-5 mt-1 flex-shrink-0 transition-colors ${
                      isActive ? 'signal-warn' : 'ink-4'
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

        {/* Admin Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 surface-2 hairline border">
            <h3 className="font-semibold ink-1 mb-3">{t('admin.tab.users')}</h3>
            <p className="text-sm ink-2 mb-4">
              {t('admin.user_mgmt_desc')}
            </p>
            <ul className="text-xs ink-2 space-y-1 ml-4">
              <li>• {t('admin.user_mgmt_li1')}</li>
              <li>• {t('admin.user_mgmt_li2')}</li>
              <li>• {t('admin.user_mgmt_li3')}</li>
            </ul>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <h3 className="font-semibold ink-1 mb-3">{t('admin.access_control')}</h3>
            <p className="text-sm text-purple-800 mb-4">
              {t('admin.access_control_desc')}
            </p>
            <ul className="text-xs text-purple-700 space-y-1 ml-4">
              <li>• {t('admin.access_control_li1')}</li>
              <li>• {t('admin.access_control_li2')}</li>
              <li>• {t('admin.access_control_li3')}</li>
            </ul>
          </Card>

          <Card className="p-6 surface-2 hairline border">
            <h3 className="font-semibold signal-warn mb-3">{t('admin.compliance')}</h3>
            <p className="text-sm signal-warn mb-4">
              {t('admin.compliance_desc')}
            </p>
            <ul className="text-xs signal-warn space-y-1 ml-4">
              <li>• {t('admin.compliance_li1')}</li>
              <li>• {t('admin.compliance_li2')}</li>
              <li>• {t('admin.compliance_li3')}</li>
            </ul>
          </Card>
        </div>

        {/* Security Best Practices */}
        <Card className="p-6 surface-2 hairline border">
          <h3 className="text-lg font-semibold signal-warn mb-4">{t('admin.security_practices')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm signal-warn">
            <div>
              <p className="font-medium mb-3">{t('admin.access_mgmt')}</p>
              <ul className="space-y-2 text-xs ml-4">
                <li>✓ {t('admin.access_mgmt_li1')}</li>
                <li>✓ {t('admin.access_mgmt_li2')}</li>
                <li>✓ {t('admin.access_mgmt_li3')}</li>
                <li>✓ {t('admin.access_mgmt_li4')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3">{t('admin.security_monitoring')}</p>
              <ul className="space-y-2 text-xs ml-4">
                <li>✓ {t('admin.security_monitoring_li1')}</li>
                <li>✓ {t('admin.security_monitoring_li2')}</li>
                <li>✓ {t('admin.security_monitoring_li3')}</li>
                <li>✓ {t('admin.security_monitoring_li4')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3">{t('admin.system_health')}</p>
              <ul className="space-y-2 text-xs ml-4">
                <li>✓ {t('admin.system_health_li1')}</li>
                <li>✓ {t('admin.system_health_li2')}</li>
                <li>✓ {t('admin.system_health_li3')}</li>
                <li>✓ {t('admin.system_health_li4')}</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-3">{t('admin.compliance')}</p>
              <ul className="space-y-2 text-xs ml-4">
                <li>✓ {t('admin.compliance_li_a')}</li>
                <li>✓ {t('admin.compliance_li_b')}</li>
                <li>✓ {t('admin.compliance_li_c')}</li>
                <li>✓ {t('admin.compliance_li_d')}</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Admin Access Warning */}
        <Card className="p-4 surface-2 hairline border">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 signal-crit" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium signal-crit">{t('admin.access_required')}</p>
              <p className="text-xs signal-crit mt-1">
                {t('admin.access_required_desc')}
              </p>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
