/**
 * API client for the Atlas backend.
 *
 * Uses the native fetch API (no axios dependency needed).
 * - Base URL is read from VITE_API_URL (default http://localhost:3000/v1).
 * - Uses httpOnly BFF session cookies for browser authentication.
 * - Sends the CSRF double-submit header for state-changing requests when present.
 * - On 401, clears stored tokens and redirects to /login.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL || '/v1';

const CSRF_COOKIE = 'atlas_csrf';
const CSRF_HEADER = 'x-csrf-token';

// ---------------------------------------------------------------------------
// Error type that mirrors the standard ApiError shape from the backend
// ---------------------------------------------------------------------------

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  statusCode: number;
  error: string;
  details?: unknown;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.statusCode = apiError.statusCode;
    this.error = apiError.error;
    this.details = apiError.details;
  }
}

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const base = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function getCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function getCsrfHeaders(method: string): Record<string, string> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    return {};
  }

  const csrfToken = getCookie(CSRF_COOKIE);
  if (csrfToken) {
    return { [CSRF_HEADER]: decodeURIComponent(csrfToken) };
  }

  return {};
}

function handle401(): void {
  localStorage.removeItem('atlas_user');
  // Redirect to login — using window.location so it works outside React tree
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, params, headers: extraHeaders } = options;

  const url = buildUrl(path, params);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getCsrfHeaders(method),
    ...extraHeaders,
  };

  const fetchInit: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchInit);

  // Handle 401 — redirect to login
  if (response.status === 401) {
    handle401();
    throw new ApiRequestError({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Session expired. Please log in again.',
    });
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError: ApiError = {
      statusCode: response.status,
      error: data?.error || response.statusText,
      message: data?.message || 'An unexpected error occurred',
      details: data?.details,
    };
    throw new ApiRequestError(apiError);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', params });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}
