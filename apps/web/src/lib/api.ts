export const SESSION_STORAGE_KEY = 'unknown-useful-site.session';
export const AUTH_EXPIRED_EVENT = 'auth-expired';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export function apiUrl(path: string, base = API_BASE_URL): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedBase = base.replace(/\/+$/, '');
  if (!normalizedBase) {
    return normalizedPath;
  }
  return `${normalizedBase}${normalizedPath}`;
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

export function setSessionToken(token: string): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, token);
}

export function clearSessionToken(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function readJson(response: Response): Promise<unknown> {
  return response.text().then((text) => {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  });
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const candidate = payload as ApiErrorPayload;
    if (candidate.error && typeof candidate.error.message === 'string') {
      return candidate.error.message;
    }
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }
  if (typeof payload === 'string') {
    return payload;
  }
  return '请求失败，请稍后重试';
}

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const candidate = payload as ApiErrorPayload;
    if (candidate.error && typeof candidate.error.code === 'string') {
      return candidate.error.code;
    }
  }
  return `http_${status}`;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getSessionToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const { body, ...rest } = options;
  const request: RequestInit = { ...rest, headers };
  if (body !== undefined) {
    if (body instanceof FormData) {
      request.body = body;
    } else {
      headers.set('Content-Type', 'application/json');
      request.body = JSON.stringify(body);
    }
  }

  const response = await fetch(apiUrl(path), request);
  const payload = await readJson(response);

  if (response.status === 401) {
    clearSessionToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    throw new ApiError(errorCode(payload, response.status), errorMessage(payload), response.status);
  }

  return payload as T;
}
