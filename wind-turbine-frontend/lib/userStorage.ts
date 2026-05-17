/**
 * Server-backed per-user storage.
 *
 * Wraps the backend `/storage/{namespace}/{key}` endpoint so config pages,
 * report schedules, etc. persist across browsers and devices for the same
 * user — not just in localStorage on one machine.
 *
 * Falls back to localStorage when the user is unauthenticated or the
 * backend is unreachable, so a fresh visit to /login still works.
 */

import { getApiWithAuth, putApiWithAuth, deleteApiWithAuth } from './api';

export async function fetchUserStorage<T>(namespace: string, key: string): Promise<T | null> {
  try {
    return await getApiWithAuth<T>(`/storage/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
  } catch {
    // 404 → key not set yet; any other failure → fall through to localStorage
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(`${namespace}:${key}`);
      if (raw) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

export async function fetchUserStorageNamespace<T extends Record<string, unknown>>(
  namespace: string,
): Promise<T> {
  try {
    return await getApiWithAuth<T>(`/storage/${encodeURIComponent(namespace)}`);
  } catch {
    return {} as T;
  }
}

export async function saveUserStorage<T>(namespace: string, key: string, value: T): Promise<void> {
  // Always write to localStorage as a fast local mirror — UI doesn't have to
  // wait on the round-trip, and offline sessions still work.
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
    } catch {
      // storage full / private mode — ignore
    }
  }
  await putApiWithAuth(`/storage/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, { value });
}

export async function deleteUserStorage(namespace: string, key: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(`${namespace}:${key}`);
    } catch {
      // ignore
    }
  }
  await deleteApiWithAuth(`/storage/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
}
