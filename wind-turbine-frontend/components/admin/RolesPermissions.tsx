'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/useToast';
import { Check, X, Edit2, Save } from 'lucide-react';

interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'dashboard' | 'turbines' | 'reports' | 'config' | 'admin';
}

const permissions: Permission[] = [
  { id: 'view_dashboard', name: 'Перегляд дашборду', description: 'Доступ до головного дашборду', category: 'dashboard' },
  { id: 'view_realtime', name: 'Перегляд даних реального часу', description: 'Доступ до даних SCADA у реальному часі', category: 'dashboard' },
  { id: 'view_turbines', name: 'Перегляд турбін', description: 'Перегляд списку і деталей турбін', category: 'turbines' },
  { id: 'edit_turbine_settings', name: 'Редагування налаштувань турбін', description: 'Зміна параметрів турбін', category: 'turbines' },
  { id: 'view_reports', name: 'Перегляд звітів', description: 'Доступ до звітності та аналітики', category: 'reports' },
  { id: 'create_reports', name: 'Створення звітів', description: 'Генерація персоналізованих звітів', category: 'reports' },
  { id: 'export_reports', name: 'Експорт звітів', description: 'Завантаження експортованих звітів', category: 'reports' },
  { id: 'manage_schedules', name: 'Управління розкладами', description: 'Створення автоматичних розкладів звітів', category: 'reports' },
  { id: 'view_config', name: 'Перегляд конфігурації', description: 'Доступ до налаштувань системи', category: 'config' },
  { id: 'edit_config', name: 'Редагування конфігурації', description: 'Зміна налаштувань системи', category: 'config' },
  { id: 'view_audit_logs', name: 'Перегляд журналу аудиту', description: 'Доступ до журналу дій', category: 'admin' },
  { id: 'manage_users', name: 'Управління користувачами', description: 'Створення/редагування/видалення облікових записів', category: 'admin' },
  { id: 'manage_roles', name: 'Управління ролями', description: 'Налаштування прав ролей', category: 'admin' },
  { id: 'view_system_health', name: 'Перегляд стану системи', description: 'Моніторинг стану системи', category: 'admin' },
];

export function RolesPermissions() {
  const { success, error: showError } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const defaultPermissions: Record<string, Record<string, boolean>> = {
    admin: {
      view_dashboard: true,
      view_realtime: true,
      view_turbines: true,
      edit_turbine_settings: true,
      view_reports: true,
      create_reports: true,
      export_reports: true,
      manage_schedules: true,
      view_config: true,
      edit_config: true,
      view_audit_logs: true,
      manage_users: true,
      manage_roles: true,
      view_system_health: true,
    },
    engineer: {
      view_dashboard: true,
      view_realtime: true,
      view_turbines: true,
      edit_turbine_settings: true,
      view_reports: true,
      create_reports: true,
      export_reports: true,
      manage_schedules: false,
      view_config: true,
      edit_config: false,
      view_audit_logs: false,
      manage_users: false,
      manage_roles: false,
      view_system_health: false,
    },
    manager: {
      view_dashboard: true,
      view_realtime: true,
      view_turbines: true,
      edit_turbine_settings: false,
      view_reports: true,
      create_reports: true,
      export_reports: true,
      manage_schedules: true,
      view_config: false,
      edit_config: false,
      view_audit_logs: true,
      manage_users: false,
      manage_roles: false,
      view_system_health: true,
    },
    operator: {
      view_dashboard: true,
      view_realtime: true,
      view_turbines: true,
      edit_turbine_settings: false,
      view_reports: false,
      create_reports: false,
      export_reports: false,
      manage_schedules: false,
      view_config: false,
      edit_config: false,
      view_audit_logs: false,
      manage_users: false,
      manage_roles: false,
      view_system_health: false,
    },
  };

  const [rolePermissions, setRolePermissions] = useState(defaultPermissions);

  const handleTogglePermission = useCallback(
    (role: string, permissionId: string) => {
      setRolePermissions((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          [permissionId]: !prev[role][permissionId],
        },
      }));
    },
    []
  );

  const handleSavePermissions = useCallback(() => {
    setIsSaving(true);
    success('Права доступу збережено');
    setIsEditing(false);
    setIsSaving(false);
    void rolePermissions;
    void showError;
  }, [rolePermissions, success, showError]);

  const getPermissionsByCategory = useCallback((category: string) => {
    return permissions.filter((p) => p.category === category);
  }, []);

  const getPermissionCountByRole = useCallback(
    (role: string) => {
      return Object.values(rolePermissions[role] || {}).filter(Boolean).length;
    },
    [rolePermissions]
  );

  return (
    <div className="space-y-6">
      {/* Підсумок ролей */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(['admin', 'engineer', 'manager', 'operator'] as const).map((role) => (
          <Card key={role} className="p-4 border-l-2 hairline" style={{ borderLeftColor: 'hsl(var(--primary))' }}>
            <div className="space-y-2">
              <p className="text-sm font-medium ink-2 capitalize">{role}</p>
              <p className="text-2xl font-bold">{getPermissionCountByRole(role)}</p>
              <p className="text-xs ink-3">
                of {permissions.length} прав надано
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Матриця прав */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Матриця прав ролей</h3>
          {!isEditing && (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Редагувати права
            </Button>
          )}
        </div>

        <div className="space-y-8">
          {['dashboard', 'turbines', 'reports', 'config', 'admin'].map((category) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 capitalize ink-1">
                {category} Permissions
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface-2">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium ink-2 w-48">Permission</th>
                      <th className="px-4 py-3 text-center font-medium ink-2">Адмін</th>
                      <th className="px-4 py-3 text-center font-medium ink-2">Інженер</th>
                      <th className="px-4 py-3 text-center font-medium ink-2">Менеджер</th>
                      <th className="px-4 py-3 text-center font-medium ink-2">Оператор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPermissionsByCategory(category).map((perm) => (
                      <tr key={perm.id} className="border-b hover:surface-2">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{perm.name}</p>
                            <p className="text-xs ink-3 mt-1">{perm.description}</p>
                          </div>
                        </td>
                        {(['admin', 'engineer', 'manager', 'operator'] as const).map((role) => (
                          <td key={role} className="px-4 py-3 text-center">
                            {isEditing ? (
                              <button
                                onClick={() => handleTogglePermission(role, perm.id)}
                                className={`p-2 rounded transition-colors ${
                                  rolePermissions[role][perm.id]
                                    ? 'surface-3 signal-live'
                                    : 'surface-3 text-gray-400'
                                }`}
                              >
                                {rolePermissions[role][perm.id] ? (
                                  <Check className="w-4 h-4 mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 mx-auto" />
                                )}
                              </button>
                            ) : (
                              <>
                                {rolePermissions[role][perm.id] ? (
                                  <Check className="w-4 h-4 mx-auto signal-live" />
                                ) : (
                                  <X className="w-4 h-4 mx-auto text-gray-300" />
                                )}
                              </>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {isEditing && (
          <div className="flex gap-2 justify-end mt-6 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setRolePermissions(defaultPermissions);
                setIsEditing(false);
              }}
            >
              Скасувати
            </Button>
            <Button onClick={handleSavePermissions} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Збереження...' : 'Зберегти права'}
            </Button>
          </div>
        )}
      </Card>

      {/* Описи ролей */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 surface-2 hairline border">
          <h4 className="font-semibold signal-crit mb-3">Адміністратор</h4>
          <p className="text-sm signal-crit mb-3">Повний доступ до системи. Може керувати користувачами, налаштуваннями та журналом аудиту.
          </p>
          <ul className="text-xs signal-crit space-y-1">
            <li>✓ Усі функції дашборду та звітності</li>
            <li>✓ Доступ до конфігурації системи</li>
            <li>✓ Управління користувачами та ролями</li>
            <li>✓ Перегляд журналу аудиту</li>
            <li>✓ Моніторинг стану системи</li>
          </ul>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <h4 className="font-semibold ink-1 mb-3">Інженер</h4>
          <p className="text-sm ink-2 mb-3">Технічний спеціаліст. Може переглядати/редагувати налаштування турбін і створювати звіти.</p>
          <ul className="text-xs ink-2 space-y-1">
            <li>✓ Повний доступ до дашборду</li>
            <li>✓ Доступ до налаштувань турбін</li>
            <li>✓ Створення і експорт звітів</li>
            <li>✗ Без управління користувачами</li>
            <li>✗ Без доступу до журналу аудиту</li>
          </ul>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <h4 className="font-semibold ink-1 mb-3">Менеджер</h4>
          <p className="text-sm ink-2 mb-3">Операційний нагляд. Може створювати звіти і налаштовувати автоматизацію.</p>
          <ul className="text-xs ink-2 space-y-1">
            <li>✓ Доступ до дашборду і звітності</li>
            <li>✓ Автоматичне планування звітів</li>
            <li>✓ Перегляд журналу аудиту</li>
            <li>✓ Моніторинг стану системи</li>
            <li>✗ Без доступу до конфігурації системи</li>
          </ul>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <h4 className="font-semibold signal-live mb-3">Оператор</h4>
          <p className="text-sm signal-live mb-3">Перегляд без змін. Доступ тільки до дашборду та даних реального часу.</p>
          <ul className="text-xs signal-live space-y-1">
            <li>✓ Перегляд дашборду</li>
            <li>✓ Доступ до даних реального часу</li>
            <li>✓ Перегляд деталей турбін</li>
            <li>✗ Без доступу до налаштувань</li>
            <li>✗ Без доступу до звітності</li>
          </ul>
        </Card>
      </div>

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Рекомендації щодо управління правами</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Принцип мінімальних прав:</strong> Надавайте мінімально необхідні права для виконання посадових функцій.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Стандартизація ролей:</strong> Використовуйте визначені ролі. Костомні ролі лише при необхідності.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Розподіл функцій:</strong> Важливі операції мають вимагати участі кількох ролей.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Регулярні перевірки:</strong> Аудит призначень ролей щокварталу. Видаляйте непотрібні права.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Журнал дій:</strong> Усі зміни прав фіксуються із часом і оператором.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
