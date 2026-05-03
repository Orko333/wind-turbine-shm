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
 * Core fetch function with помилка handling
 */
async function fetchJson<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
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
