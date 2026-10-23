import type { ApiError, Health, LoginRequest, Session } from '../../../CONTRACTS/types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null) {
    super(body?.error.message ?? `Request failed with status ${status}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiClientError(response.status, body as ApiError | null);
  return body as T;
}

export const apiClient = {
  health: () => request<Health>('/healthz'),
  login: (input: LoginRequest) => request<Session>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  session: () => request<Session>('/api/v1/auth/session'),
};
