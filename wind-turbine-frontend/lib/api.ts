/**
 * API Client
 * Centralized HTTP client with помилка handling, timeout, and authentication headers
 */


// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://test1111ww-wind-turbine-shm-api.hf.space";
const REQUEST_TIMEOUT = 30000; // 30 seconds

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = REQUEST_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(408, `Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Try to silently refresh the access token from the httpOnly cookie session.
 * Returns the new token, or null if the cookie session is also gone.
 */
let inflightRefresh: Promise<string | null> | null = null;
async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const r = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) return null;
      const data = (await r.json().catch(() => null)) as { access_token?: string } | null;
      const token = data?.access_token;
      if (token) {
        try {
          localStorage.setItem("auth_token", token);
        } catch {
          /* localStorage may be blocked */
        }
        return token;
      }
      return null;
    } catch {
      return null;
    } finally {
      // clear after a tick so concurrent callers share the same refresh
      setTimeout(() => {
        inflightRefresh = null;
      }, 0);
    }
  })();
  return inflightRefresh;
}

/**
 * Core fetch function with помилка handling
 */
async function fetchJson<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number; _retried?: boolean } = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Authenticated request returned 401 — try to refresh the token once
    // and replay the request. This rescues users whose localStorage token
    // expired but whose httpOnly cookie session is still valid (common
    // after a backend restart that didn't rotate JWT_SECRET).
    if (response.status === 401 && !options._retried) {
      const headers = (options.headers || {}) as Record<string, string>;
      const hadAuth = "Authorization" in headers;
      if (hadAuth) {
        const fresh = await refreshAccessToken();
        if (fresh) {
          return fetchJson<T>(endpoint, {
            ...options,
            _retried: true,
            headers: {
              ...headers,
              Authorization: `Bearer ${fresh}`,
            },
          });
        }
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data?.error || `HTTP ${response.status}`,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof TypeError) {
      throw new ApiError(0, "Network error: " + error.message);
    }
    throw new ApiError(500, "Unknown error occurred", error);
  }
}

/**
 * GET request
 */
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchJson<T>(endpoint, {
    ...options,
    method: "GET",
  });
}

/**
 * POST request with authentication
 */
export async function postApiWithAuth<T>(
  endpoint: string,
  body: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const token = getAuthToken();

  return fetchJson<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });
}

/**
 * GET request with authentication
 */
export async function getApiWithAuth<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const token = getAuthToken();

  return fetchJson<T>(endpoint, {
    ...options,
    method: "GET",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });
}

/**
 * PUT request with authentication
 */
export async function putApiWithAuth<T>(
  endpoint: string,
  body: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const token = getAuthToken();

  return fetchJson<T>(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(body),
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });
}

/**
 * PATCH request with authentication
 */
export async function patchApiWithAuth<T>(
  endpoint: string,
  body: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const token = getAuthToken();

  return fetchJson<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });
}

/**
 * DELETE request with authentication
 */
export async function deleteApiWithAuth<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const token = getAuthToken();

  return fetchJson<T>(endpoint, {
    ...options,
    method: "DELETE",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });
}

/**
 * Authenticated binary (Blob) GET with one-shot token refresh on 401 — for file
 * downloads (CSV export) that the JSON helpers can't return. Without this the
 * SCADA export used a raw fetch with a possibly-stale localStorage token and
 * failed silently ("doesn't export") instead of refreshing like the rest of the app.
 */
export async function getBlobWithAuth(endpoint: string): Promise<Blob> {
  const url = `${API_BASE_URL}${endpoint}`;
  const doFetch = (token: string | null) =>
    // Large CSV exports on the slow free-tier backend (or a cold start) can take
    // far longer than the 30s default — use a generous 3-minute timeout.
    fetchWithTimeout(url, { timeout: 180_000, headers: token ? { Authorization: `Bearer ${token}` } : {} });

  let res = await doFetch(getAuthToken());
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await doFetch(fresh);
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Export failed (HTTP ${res.status})`);
  }
  return res.blob();
}

/**
 * Отримати authorization token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

/**
 * Встановити authorization token in localStorage
 */
export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("auth_token", token);
  } catch {
    console.error("Failed to store auth token");
  }
}

/**
 * Clear authorization token from localStorage
 */
export function clearAuthToken(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem("auth_token");
  } catch {
    console.error("Failed to clear auth token");
  }
}

/**
 * Check if request failed due to authentication
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Format помилка повідомлення for display
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}
