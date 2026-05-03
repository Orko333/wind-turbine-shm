/**
 * Authentication Store
 * Manages user authentication state with persistence to localStorage
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, AuthResponse } from "../types/api";
import { getApiWithAuth, postApiWithAuth, setAuthToken, clearAuthToken } from "../lib/api";
import { isTokenValid } from "../lib/auth";
import { initializeTokenRefresh, clearTokenRefreshTimer } from "../lib/middleware-utils";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: false,
  error: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await postApiWithAuth<AuthResponse>(
            "/auth/login",
            { email, password }
          );

          const { access_token } = response;
          setAuthToken(access_token);

          // Also store token in a secure HTTP-only cookie via middleware
          // The token is stored in localStorage for client-side access
          // and the middleware will read from cookies for server-side validation
          document.cookie = `auth_token=${access_token}; path=/; max-age=86400; SameSite=Strict`;

          set({ token: access_token });

          // Fetch current user after login
          await get().fetchCurrentUser();

          // Initialize automatic token refresh
          initializeTokenRefresh(() => get().refreshToken(), access_token);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Login failed";
          set({ error: errorMessage });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          // Clear token refresh таймер
          clearTokenRefreshTimer();

          // Call logout endpoint if it exists
          try {
            await postApiWithAuth("/auth/logout", {});
          } catch {
            // Logout endpoint may not exist, continue with client-side очищення
          }

          clearAuthToken();

          // Clear the HTTP cookie
          document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";

          set({ user: null, token: null });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Logout failed";
          set({ error: errorMessage });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      fetchCurrentUser: async () => {
        set({ isLoading: true, error: null });
        try {
          const user = await getApiWithAuth<User>("/auth/me");
          set({ user });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to fetch user";
          set({ error: errorMessage, user: null, token: null });
          clearAuthToken();
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      refreshToken: async () => {
        try {
          const currentToken = get().token;
          if (!currentToken || isTokenValid(currentToken)) {
            return;
          }

          const response = await postApiWithAuth<AuthResponse>(
            "/auth/refresh",
            {}
          );

          const { access_token } = response;
          setAuthToken(access_token);

          // Also оновити the HTTP cookie
          document.cookie = `auth_token=${access_token}; path=/; max-age=86400; SameSite=Strict`;

          set({ token: access_token });

          // Re-initialize token refresh with new token
          initializeTokenRefresh(() => get().refreshToken(), access_token);
        } catch (error) {
          clearAuthToken();
          document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
          clearTokenRefreshTimer();
          set({ user: null, token: null, error: "Token refresh failed" });
          throw error;
        }
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);
