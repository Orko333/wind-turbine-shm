/**
 * Хук useRole
 * Забезпечує функціональність контролю доступу на основі ролей (RBAC)
 */

import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { hasPermission } from "../lib/auth";
import type { UserRole, RolePermissions } from "../types/domain";

interface UseRoleReturn {
  role: UserRole | null;
  hasPermission: (requiredRole: string) => boolean;
  canViewDashboard: () => boolean;
  canViewTurbines: () => boolean;
  canEditConfig: () => boolean;
  canRunSimulations: () => boolean;
  canViewAnalytics: () => boolean;
  canManageUsers: () => boolean;
  canAccessAdmin: () => boolean;
  rolePermissions: RolePermissions | null;
}

// Карта прав за ролями
const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    role: "admin",
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: true,
    canRunSimulations: true,
    canViewAnalytics: true,
    canManageUsers: true,
    canAccessAdmin: true,
  },
  engineer: {
    role: "engineer",
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: true,
    canRunSimulations: true,
    canViewAnalytics: true,
    canManageUsers: false,
    canAccessAdmin: false,
  },
  manager: {
    role: "manager",
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: false,
    canRunSimulations: false,
    canViewAnalytics: true,
    canManageUsers: false,
    canAccessAdmin: false,
  },
  operator: {
    role: "operator",
    canViewDashboard: true,
    canViewTurbines: true,
    canEditConfig: false,
    canRunSimulations: false,
    canViewAnalytics: false,
    canManageUsers: false,
    canAccessAdmin: false,
  },
};

/**
 * Хук useRole — управляє контролем доступу на основі ролей
 * @returns Інформація про роль та функції перевірки прав
 */
export function useRole(): UseRoleReturn {
  const { user } = useAuth();

  const devFallback: UserRole | null =
    process.env.NODE_ENV === 'development' ? 'admin' : null;
  const role = (user?.role as UserRole) || devFallback;

  const rolePermissions = useMemo(() => {
    return role ? ROLE_PERMISSIONS[role] : null;
  }, [role]);

  const handleHasPermission = (requiredRole: string): boolean => {
    if (!role) return false;
    return hasPermission(role, requiredRole);
  };

  const canViewDashboard = (): boolean => rolePermissions?.canViewDashboard ?? false;
  const canViewTurbines = (): boolean => rolePermissions?.canViewTurbines ?? false;
  const canEditConfig = (): boolean => rolePermissions?.canEditConfig ?? false;
  const canRunSimulations = (): boolean => rolePermissions?.canRunSimulations ?? false;
  const canViewAnalytics = (): boolean => rolePermissions?.canViewAnalytics ?? false;
  const canManageUsers = (): boolean => rolePermissions?.canManageUsers ?? false;
  const canAccessAdmin = (): boolean => rolePermissions?.canAccessAdmin ?? false;

  return {
    role,
    hasPermission: handleHasPermission,
    canViewDashboard,
    canViewTurbines,
    canEditConfig,
    canRunSimulations,
    canViewAnalytics,
    canManageUsers,
    canAccessAdmin,
    rolePermissions,
  };
}
