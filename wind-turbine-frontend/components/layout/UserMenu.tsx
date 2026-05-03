'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import type { User as UserType } from '@/types/api';
import type { UserRole } from '@/types/domain';
import { useT } from '@/lib/i18n';

interface UserMenuProps {
  user: UserType;
  role: UserRole | null;
}

/**
 * Компонент меню користувача
 * Можливості:
 * - Випадаюче меню профілю користувача
 * - Опції: Профіль, Налаштування, Вихід
 * - Аватар з ініціалами як резервне відображення
 * - Адаптивний дизайн
 * - Інтеграція з функціональністю виходу
 */
export function UserMenu({ user, role }: UserMenuProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const t = useT();

  // Отримати ініціали користувача для аватара
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  };

  // Отримати URL зображення аватара (може приходити з профілю користувача)
  const getAvatarUrl = (): string | undefined => {
    // У реальному застосунку це було б з user.avatar чи подібного
    return undefined;
  };

  // Перехід на сторінку профілю
  const handleProfileClick = useCallback(() => {
    router.push('/profile');
  }, [router]);

  // Перехід на сторінку налаштувань
  const handleSettingsClick = useCallback(() => {
    router.push('/settings');
  }, [router]);

  // Обробка виходу
  const handleLogout = useCallback(async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, router]);

  const initials = getInitials(user.name || user.email || t('user_menu.user'));
  const avatarUrl = getAvatarUrl();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg gap-2 px-2 md:px-3 h-9"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={avatarUrl} alt={user.name || t('user_menu.user')} />
            <AvatarFallback className="text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm font-medium truncate max-w-[120px]">
            {user.name || t('user_menu.user')}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {/* Заголовок з інформацією про користувача */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name || t('user_menu.user')}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {user.email}
            </p>
            {role && (
              <p className="text-xs leading-none text-muted-foreground capitalize pt-1">
                {role}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Пункти меню */}
        <DropdownMenuItem onClick={handleProfileClick}>
          <User className="mr-2 h-4 w-4" />
          <span>{t('user_menu.profile')}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleSettingsClick}>
          <Settings className="mr-2 h-4 w-4" />
          <span>{t('user_menu.settings')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Вихід */}
        <DropdownMenuItem
          onClick={handleLogout}
          className="signal-crit focus:signal-crit focus:surface-2"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('user_menu.sign_out')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
