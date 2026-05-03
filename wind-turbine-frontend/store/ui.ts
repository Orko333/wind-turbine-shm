/**
 * UI Store
 * Manages global UI state including sidebar, theme, and notifications
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  createdAt: number;
}

interface UIState {
  sidebarOpen: boolean;
  theme: Theme;
  notifications: Notification[];
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  addNotification: (notification: Omit<Notification, "id" | "createdAt">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

type UIStore = UIState & UIActions;

const initialState: UIState = {
  sidebarOpen: true,
  theme: "system",
  notifications: [],
};

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      ...initialState,

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },

      setTheme: (theme) => {
        set({ theme });
      },

      addNotification: (notification) => {
        const id = `notif-${Date.now()}-${Math.random()}`;
        const newNotification: Notification = {
          ...notification,
          id,
          createdAt: Date.now(),
        };

        set((state) => {
          // Keep only the last 10 notifications to prevent memory leaks
          const notifications = [newNotification, ...state.notifications].slice(0, 10);
          return { notifications };
        });

        return id;
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },
    }),
    {
      name: "ui-store",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    }
  )
);
