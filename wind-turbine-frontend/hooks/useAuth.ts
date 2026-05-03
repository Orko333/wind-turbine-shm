/**
 * useAuth Hook
 * Provides authentication functionality (login, logout, refresh)
 */

import { useCallback, useEffect } from "react";
import { useAuthStore } from "../store/auth";
import { initializeTokenRefresh, clearTokenRefreshTimer } from "../lib/middleware-utils";
import type { User } from "../types/api";

interface UseAuthReturn {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
}

/**
 * useAuth Hook - Manages user authentication
 * @returns Authentication state and actions
 */
export function useAuth(): UseAuthReturn {
  const {
    user,
    token,
    isLoading,
    error,
    login,
    logout,
    refreshToken,
    fetchCurrentUser,
  } = useAuthStore();

  const isAuthenticated = Boolean(token && user);

  // Wrap actions to ensure they're stable
  const handleLogin = useCallback(
    (email: string, password: string) => login(email, password),
    [login]
  );

  const handleLogout = useCallback(() => logout(), [logout]);

  const handleRefreshToken = useCallback(() => refreshToken(), [refreshToken]);

  const handleFetchCurrentUser = useCallback(
    () => fetchCurrentUser(),
    [fetchCurrentUser]
  );

  // Initialize token refresh on mount and when token changes
  useEffect(() => {
    if (token) {
      initializeTokenRefresh(() => refreshToken(), token);
    } else {
      clearTokenRefreshTimer();
    }

    return () => {
      clearTokenRefreshTimer();
    };
  }, [token, refreshToken]);

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    login: handleLogin,
    logout: handleLogout,
    refreshToken: handleRefreshToken,
    fetchCurrentUser: handleFetchCurrentUser,
  };
}
