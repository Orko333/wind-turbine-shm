'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '../../hooks/useToast';
import { Plus, Edit2, Trash2, Lock, Unlock, Mail } from 'lucide-react';

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

export function UserManagement() {
  const { success, error: showError } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      mfaEnabled: true,
    },
    {
      id: '2',
      name: 'Engineering Team Lead',
      email: 'engineer@example.com',
      role: 'engineer',
      status: 'active',
      lastLogin: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      mfaEnabled: true,
    },
    {
      id: '3',
      name: 'Operations Manager',
      email: 'manager@example.com',
      role: 'manager',
      status: 'active',
      lastLogin: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      mfaEnabled: false,
    },
    {
      id: '4',
      name: 'Turbine Operator',
      email: 'operator@example.com',
      role: 'operator',
      status: 'active',
      lastLogin: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      mfaEnabled: false,
    },
    {
      id: '5',
      name: 'Inactive User',
      email: 'inactive@example.com',
      role: 'operator',
      status: 'inactive',
      lastLogin: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      mfaEnabled: false,
    },
  ]);

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

  const handleSaveUser = useCallback(() => {
    if (!formData.name || !formData.email) {
      showError("Будь ласка, заповніть усі обов'язкові поля");
      return;
    }

    setIsSaving(true);
    if (isEditing) {
      setUsers((prev) =>
        prev.map((u) => (u.id === isEditing ? { ...u, ...formData } : u))
      );
    } else {
      setUsers((prev) => [...prev, { ...formData, id: Date.now().toString(), createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() } as User]);
    }
    success(isEditing ? 'Користувача оновлено' : 'Користувача створено');
    setFormData({ name: '', email: '', role: 'operator', status: 'active', mfaEnabled: false });
    setIsAdding(false);
    setIsEditing(null);
    setIsSaving(false);
  }, [formData, isEditing, success, showError]);

  const handleDeleteUser = useCallback(
    (userId: string) => {
      setIsSaving(true);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      success('Користувача видалено');
      setIsSaving(false);
    },
    [success]
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
          <h3 className="text-lg font-semibold">Облікові записи ({users.length})</h3>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Додати користувача
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface-2 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Ім'я</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Роль</th>
                <th className="px-4 py-3 text-left font-medium">Статус</th>
                <th className="px-4 py-3 text-left font-medium">Останній вхід</th>
                <th className="px-4 py-3 text-left font-medium">2FA</th>
                <th className="px-4 py-3 text-left font-medium">Дії</th>
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
                    <div title={user.mfaEnabled ? '2FA увімкнено' : '2FA вимкнено'}>
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
          <h3 className="font-semibold mb-6">{isEditing ? 'Редагувати користувача' : 'Додати нового користувача'}</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Повне ім'я</label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Іван Іваненко"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="ivan@example.com"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Роль</label>
                <select
                  value={formData.role || 'operator'}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="admin">Адміністратор</option>
                  <option value="engineer">Інженер</option>
                  <option value="manager">Менеджер</option>
                  <option value="operator">Оператор</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Статус</label>
                <select
                  value={formData.status || 'active'}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="w-full mt-2 px-3 py-2 surface-2 hairline border rounded-md text-sm ink-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="active">Активний</option>
                  <option value="inactive">Неактивний</option>
                  <option value="suspended">Призупинений</option>
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
              <span className="text-sm font-medium">Вимагати двофакторну автентифікацію (2FA)</span>
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
                Скасувати
              </Button>
              <Button onClick={handleSaveUser} disabled={isSaving}>
                {isSaving ? 'Збереження...' : 'Зберегти користувача'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Статистика користувачів */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-live font-medium mb-1">Всього користувачів</p>
          <p className="text-2xl font-bold ink-1">{users.length}</p>
          <p className="text-xs ink-2 mt-2">{users.filter((u) => u.status === 'active').length} активних</p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-crit font-medium mb-1">Адміністратори</p>
          <p className="text-2xl font-bold signal-crit">{users.filter((u) => u.role === 'admin').length}</p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-live font-medium mb-1">2FA увімкнено</p>
          <p className="text-2xl font-bold signal-live">{users.filter((u) => u.mfaEnabled).length}</p>
          <p className="text-xs signal-live mt-2">
            {Math.round((users.filter((u) => u.mfaEnabled).length / users.length) * 100)}% користувачів
          </p>
        </Card>

        <Card className="p-4 surface-2 hairline border">
          <p className="text-xs signal-warn font-medium mb-1">Неактивні користувачі</p>
          <p className="text-2xl font-bold signal-warn">{users.filter((u) => u.status === 'inactive').length}</p>
        </Card>
      </div>

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Рекомендації щодо управління користувачами</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Призначення ролей:</strong> Призначайте ролі відповідно до посадових обов'язків. Переглядайте щокварталу.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Безпека 2FA:</strong> Вимагайте 2FA для адміністраторів та інженерів. Рекомендовано для менеджерів.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Очищення неактивних:</strong> Переглядайте неактивні облікові записи щомісяця. Призупиняйте після 90 днів.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Журнал аудиту:</strong> Всі дії користувачів реєструються. Перевіряйте журнали доступу для відповідності.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
