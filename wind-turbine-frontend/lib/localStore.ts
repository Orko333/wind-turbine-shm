/**
 * Local-only persistence helpers for settings whose backend endpoints
 * do not yet exist. Stores JSON-serialisable objects under a namespaced key.
 *
 * Use these when a form's "save" button should produce a durable change
 * the user can rely on across reloads, without requiring server support.
 */

export function loadLocal<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeLocal(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}
