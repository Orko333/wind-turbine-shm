'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '../../hooks/useToast';
import { useLocale } from '../../lib/i18n';
import { getApiWithAuth, postApiWithAuth, patchApiWithAuth, deleteApiWithAuth } from '../../lib/api';
import { Plus, Edit2, Trash2, Lock, Unlock, Mail } from 'lucide-react';

interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  mfa_enabled: boolean;
  last_login: string | null;
  created_at: string;
}

const UM_TEXT = {
  en: {
    accounts: 'Accounts',
    addUser: 'Add User',
    name: 'Name',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    lastLogin: 'Last Login',
    twofa: '2FA',
    actions: 'Actions',
    twofaOn: '2FA enabled',
    twofaOff: '2FA disabled',
    editUser: 'Edit User',
    addNewUser: 'Add New User',
    fullName: 'Full Name',
    fullNamePh: 'Jane Doe',
    emailPh: 'jane@example.com',
    require2fa: 'Require two-factor authentication (2FA)',
    cancel: 'Cancel',
    saving: 'Saving…',
    saveUser: 'Save User',
    roleAdmin: 'Administrator',
    roleEngineer: 'Engineer',
    roleManager: 'Manager',
    roleOperator: 'Operator',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    statusSuspended: 'Suspended',
    requiredFields: 'Please fill in all required fields',
    userUpdated: 'User updated',
    userCreated: 'User created',
    userDeleted: 'User deleted',
    statTotal: 'Total Users',
    statActiveSuffix: 'active',
    statAdmins: 'Administrators',
    stat2fa: '2FA enabled',
    statShare: '{n}% of users',
    statInactive: 'Inactive Users',
    recsTitle: 'User Management Recommendations',
    rec1: 'Role assignment:',
    rec1Desc: 'Assign roles per job duties. Review quarterly.',
    rec2: '2FA security:',
    rec2Desc: 'Require 2FA for admins and engineers. Recommended for managers.',
    rec3: 'Inactive cleanup:',
    rec3Desc: 'Review inactive accounts monthly. Suspend after 90 days.',
    rec4: 'Audit log:',
    rec4Desc: 'All user actions are logged. Review access logs for compliance.',
  },
  uk: {
    accounts: 'Облікові записи',
    addUser: 'Додати користувача',
    name: "Ім'я",
    email: 'Email',
    role: 'Роль',
    status: 'Статус',
    lastLogin: 'Останній вхід',
    twofa: '2FA',
    actions: 'Дії',
    twofaOn: '2FA увімкнено',
    twofaOff: '2FA вимкнено',
    editUser: 'Редагувати користувача',
    addNewUser: 'Додати нового користувача',
    fullName: "Повне ім'я",
    fullNamePh: 'Іван Іваненко',
    emailPh: 'ivan@example.com',
    require2fa: 'Вимагати двофакторну автентифікацію (2FA)',
    cancel: 'Скасувати',
    saving: 'Збереження...',
    saveUser: 'Зберегти користувача',
    roleAdmin: 'Адміністратор',
    roleEngineer: 'Інженер',
    roleManager: 'Менеджер',
    roleOperator: 'Оператор',
    statusActive: 'Активний',
    statusInactive: 'Неактивний',
    statusSuspended: 'Призупинений',
    requiredFields: "Будь ласка, заповніть усі обов'язкові поля",
    userUpdated: 'Користувача оновлено',
    userCreated: 'Користувача створено',
    userDeleted: 'Користувача видалено',
    statTotal: 'Всього користувачів',
    statActiveSuffix: 'активних',
    statAdmins: 'Адміністратори',
    stat2fa: '2FA увімкнено',
    statShare: '{n}% користувачів',
    statInactive: 'Неактивні користувачі',
    recsTitle: 'Рекомендації щодо управління користувачами',
    rec1: 'Призначення ролей:',
    rec1Desc: "Призначайте ролі відповідно до посадових обов'язків. Переглядайте щокварталу.",
    rec2: 'Безпека 2FA:',
    rec2Desc: 'Вимагайте 2FA для адміністраторів та інженерів. Рекомендовано для менеджерів.',
    rec3: 'Очищення неактивних:',
    rec3Desc: 'Переглядайте неактивні облікові записи щомісяця. Призупиняйте після 90 днів.',
    rec4: 'Журнал аудиту:',
    rec4Desc: 'Всі дії користувачів реєструються. Перевіряйте журнали доступу для відповідності.',
  },
} as const;

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer' | 'operator' | 'manager';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  createdAt: string;
  mfaEnabled: boolean;
}

function backendToView(b: BackendUser): User {
  return {
    id: b.id,
    name: b.name,
    email: b.email,
    role: b.role as User['role'],
    status: b.status as User['status'],
    lastLogin: b.last_login || b.created_at,
    createdAt: b.created_at,
    mfaEnabled: b.mfa_enabled,
  };
}

export function UserManagement() {
  const { success, error: showError } = useToast();
  const { locale } = useLocale();
  const L = UM_TEXT[locale];
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [users, setUsers] = useState<User[]>([]);

  // Load users from backend
  useEffect(() => {
    getApiWithAuth<BackendUser[]>('/admin/users')
      .then((rows) => setUsers(rows.map(backendToView)))
      .catch((e) => console.error('Load users failed:', e));
  }, []);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'operator',
    status: 'active',
    mfaEnabled: false,
  });

  const handleInputChange = useCallback((field: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSaveUser = useCallback(async () => {
    if (!formData.name || !formData.email) {
      showError(L.requiredFields);
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        const updated = await patchApiWithAuth<BackendUser>(`/admin/users/${isEditing}`, {
          name: formData.name,
          role: formData.role,
          status: formData.status,
          mfa_enabled: formData.mfaEnabled,
        });
        setUsers((prev) => prev.map((u) => (u.id === isEditing ? backendToView(updated) : u)));
      } else {
        const created = await postApiWithAuth<BackendUser>('/admin/users', {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: formData.status,
          mfa_enabled: formData.mfaEnabled,
        });
        setUsers((prev) => [...prev, backendToView(created)]);
      }
      success(isEditing ? L.userUpdated : L.userCreated);
      setFormData({ name: '', email: '', role: 'operator', status: 'active', mfaEnabled: false });
      setIsAdding(false);
      setIsEditing(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Save failed');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, isEditing, success, showError, L]);

  const handleDeleteUser = useCallback(
    async (userId: string) => {
      setIsSaving(true);
      try {
        await deleteApiWithAuth(`/admin/users/${userId}`);
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        success(L.userDeleted);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Delete failed');
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    },
    [success, showError, L]
  );

  const getRoleBadgeColor = useCallback((role: string) => {
    const colors: Record<string, string> = {
      admin:    'surface-3 signal-crit hairline border',
      engineer: 'surface-3 signal-warn hairline border',
      manager:  'surface-3 signal-live hairline border',
      operator: 'surface-3 ink-2 hairline border',
    };
    return `${colors[role] || 'surface-3 ink-1'} mono text-[10px] tracking-widest uppercase`;
  }, []);

  const getStatusBadgeColor = useCallback((status: string) => {
    const colors: Record<string, string> = {
      active: 'surface-3 signal-live',
      inactive: 'surface-3 ink-1',
      suspended: 'surface-3 signal-crit',
    };
    return colors[status] || 'surface-3 ink-1';
  }, []);

  const formatDate = useCallback((date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const formatTime = useCallback((date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, []);

  return (
    <div className="space-y-6">
      {/* Таблиця користувачів */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{L.accounts} ({users.length})</h3>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {L.addUser}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface-2 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{L.name}</th>
                <th className="px-4 py-3 text-left font-medium">{L.email}</th>
                <th className="px-4 py-3 text-left font-medium">{L.role}</th>
                <th className="px-4 py-3 text-left font-medium">{L.status}</th>
                <th className="px-4 py-3 text-left font-medium">{L.lastLogin}</th>
                <th className="px-4 py-3 text-left font-medium">{L.twofa}</th>
                <th className="px-4 py-3 text-left font-medium">{L.actions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:surface-2">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(user.status)}`}>
                      {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs ink-3" suppressHydrationWarning>
                    {formatDate(user.lastLogin)} {formatTime(user.lastLogin)}
                  </td>
                  <td className="px-4 py-3">
                    <div title={user.mfaEnabled ? L.twofaOn : L.twofaOff}>
                      {user.mfaEnabled ? (
                        <Lock className="w-4 h-4 signal-live" />
                      ) : (
                        <Unlock className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFormData(user);
                          setIsEditing(user.id);
                          setIsAdding(true);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={isSaving}
                        className="signal-crit hover:signal-crit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Форма додавання/редагування */}
      {isAdding && (
        <Card className="p-6 surface-2 hairline border">
          <h3 className="font-semibold mb-6">{isEditing ? L.editUser : L.addNewUser}</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{L.fullName}</label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder={L.fullNamePh}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{L.email}</label>
                <Input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder={L.emailPh}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{L.role}</label>
                <select
                  value={formData.role || 'operator'}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="admin">{L.roleAdmin}</option>
                  <option value="engineer">{L.roleEngineer}</option>
                  <option value="manager">{L.roleManager}</option>
                  <option value="operator">{L.roleOperator}</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">{L.status}</label>
                <select
                  value={formData.status || 'active'}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="active">{L.statusActive}</option>
                  <option value="inactive">{L.statusInactive}</option>
                  <option value="suspended">{L.statusSuspended}</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 p-3 border rounded">
              <input
                type="checkbox"
                checked={formData.mfaEnabled || false}
                onChange={(e) => handleInputChange('mfaEnabled', e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">{L.require2fa}</span>
            </label>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setIsEditing(null);
                  setFormData({ name: '', email: '', role: 'operator', status: 'active', mfaEnabled: false });
                }}
              >
                {L.cancel}
              </Button>
              <Button onClick={handleSaveUser} disabled={isSaving}>
                {isSaving ? L.saving : L.saveUser}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Статистика користувачів */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-live font-medium mb-1">{L.statTotal}</p>
          <p className="text-2xl font-bold ink-1">{users.length}</p>
          <p className="text-xs ink-2 mt-2">{users.filter((u) => u.status === 'active').length} {L.statActiveSuffix}</p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-crit font-medium mb-1">{L.statAdmins}</p>
          <p className="text-2xl font-bold signal-crit">{users.filter((u) => u.role === 'admin').length}</p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-live font-medium mb-1">{L.stat2fa}</p>
          <p className="text-2xl font-bold signal-live">{users.filter((u) => u.mfaEnabled).length}</p>
          <p className="text-xs signal-live mt-2">
            {L.statShare.replace('{n}', String(Math.round((users.filter((u) => u.mfaEnabled).length / users.length) * 100)))}
          </p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-warn font-medium mb-1">{L.statInactive}</p>
          <p className="text-2xl font-bold signal-warn">{users.filter((u) => u.status === 'inactive').length}</p>
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">{L.recsTitle}</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.rec1}</strong> {L.rec1Desc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.rec2}</strong> {L.rec2Desc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.rec3}</strong> {L.rec3Desc}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>{L.rec4}</strong> {L.rec4Desc}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
