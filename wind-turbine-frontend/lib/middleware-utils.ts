/**
 * Middleware Utilities
 * Helper functions for token management, refresh logic, and permission checks
 * Works in conjunction with src/middleware.ts
 */

import { getTokenExpiresIn, isTokenExpired } from "./auth";

/**
 * Token refresh configuration
 */
const TOKEN_REFRESH_THRESHOLD = 5 * 60; // 5 minutes in seconds
const TOKEN_REFRESH_RETRY_DELAY = 60 * 1000; // 1 minute

let tokenRefreshTimer: NodeJS.Timeout | null = null;
let isRefreshing = false;

/**
 * Check if token should be refreshed
 * Returns true if token exists and has less than threshold time remaining
 */
export function shouldRefreshToken(token: string | null): boolean {
  if (!token) return false;

  const expiresIn = getTokenExpiresIn(token);
  return expiresIn > 0 && expiresIn < TOKEN_REFRESH_THRESHOLD;
}

/**
 * Initialize token refresh таймер
 * Automatically refreshes token before expiration
 */
export function initializeTokenRefresh(
  onRefresh: () => Promise<void>,
  token: string | null
): void {
  // Clear existing таймер
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }

  // No token, nothing to refresh
  if (!token || isTokenExpired(token)) {
    return;
  }

  // Calculate time until refresh (when 5 minutes remain)
  const expiresIn = getTokenExpiresIn(token);
  const timeUntilRefresh = Math.max(
    0,
    (expiresIn - TOKEN_REFRESH_THRESHOLD) * 1000
  );

  // Встановити up refresh таймер
  tokenRefreshTimer = setTimeout(async () => {
    if (isRefreshing) return;

    isRefreshing = true;
    try {
      await onRefresh();
    } catch (error) {
      console.error("Token refresh failed:", error);
      // Retry after delay
      tokenRefreshTimer = setTimeout(async () => {
        try {
          await onRefresh();
        } catch {
          console.error("Token refresh retry failed");
        }
      }, TOKEN_REFRESH_RETRY_DELAY);
    } finally {
      isRefreshing = false;
    }
  }, timeUntilRefresh);
}

/**
 * Clear token refresh таймер
 */
export function clearTokenRefreshTimer(): void {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

/**
 * Permission check utility
 * Validates if a user role has access to specific routes/resources
 */
export function hasRouteAccess(
  userRole: string,
  requiredRoles: string[]
): boolean {
  if (requiredRoles.length === 0) {
    return true; // Public route
  }

  return requiredRoles.includes(userRole.toLowerCase());
}

/**
 * Отримати all roles that can access a route
 */
export function getAccessibleRoles(route: string): string[] {
  const roleHierarchy: Record<string, string[]> = {
    admin: ["admin", "manager", "engineer", "operator"],
    manager: ["manager", "engineer", "operator"],
    engineer: ["engineer"],
    operator: ["operator"],
  };

  // Map routes to minimum required role
  const routeRoleMap: Record<string, string> = {
    "/dashboard": "operator",
    "/simulations": "engineer",
    "/simulations/create": "engineer",
    "/analysis": "engineer",
    "/turbines": "operator",
    "/alerts": "operator",
    "/settings": "manager",
    "/users": "admin",
    "/audit-logs": "admin",
  };

  const minRequiredRole = routeRoleMap[route];
  if (!minRequiredRole) {
    return []; // Public route
  }

  return roleHierarchy[minRequiredRole] || [];
}

/**
 * Check if a role is higher or equal in the hierarchy
 */
export function isRoleHigherOrEqual(
  userRole: string,
  requiredRole: string
): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 4,
    manager: 3,
    engineer: 2,
    operator: 1,
  };

  const userLevel = roleHierarchy[userRole.toLowerCase()] || 0;
  const requiredLevel = roleHierarchy[requiredRole.toLowerCase()] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Отримати human-readable role name
 */
export function getRoleDisplayName(role: string): string {
  const roleNames: Record<string, string> = {
    admin: "Administrator",
    manager: "Manager",
    engineer: "Engineer",
    operator: "Operator",
  };

  return roleNames[role.toLowerCase()] || role;
}

/**
 * Parse user info from response headers (injected by middleware)
 */
export function parseUserFromHeaders(headers: Headers): {
  userId: string;
  email: string;
  role: string;
  tokenExpiresIn: number;
} {
  return {
    userId: headers.get("x-user-id") || "",
    email: headers.get("x-user-email") || "",
    role: headers.get("x-user-role") || "",
    tokenExpiresIn: parseInt(headers.get("x-token-expires-in") || "0"),
  };
}
