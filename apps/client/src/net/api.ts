// Gọi REST tới server (cùng nguồn; khi dev, Vite chuyển tiếp /api).
import type {
  AccountCreatedResponse,
  ApiError,
  CapacityResponse,
  MeResponse,
  Profile,
  RecoverResponse,
} from '@dilam/shared';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: ApiError['error'] | 'network'; reason?: string };

export class ApiClient {
  constructor(
    private token: string | null = null,
    private readonly base = '',
  ) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      return { ok: false, status: 0, error: 'network' };
    }
    if (response.status === 204) return { ok: true, value: undefined as T };
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // không có body JSON
    }
    if (response.ok) return { ok: true, value: data as T };
    const err = (data ?? {}) as Partial<ApiError>;
    return {
      ok: false,
      status: response.status,
      error: err.error ?? (response.status >= 500 ? 'network' : 'bad_request'),
      ...(err.reason ? { reason: err.reason } : {}),
    };
  }

  createAccount(timeZone: string, guest = false): Promise<ApiResult<AccountCreatedResponse>> {
    return this.request('POST', '/api/accounts', { timeZone, ...(guest ? { guest } : {}) });
  }

  recover(recoveryCode: string): Promise<ApiResult<RecoverResponse>> {
    return this.request('POST', '/api/accounts/recover', { recoveryCode });
  }

  me(): Promise<ApiResult<MeResponse>> {
    return this.request('GET', '/api/me');
  }

  saveCharacter(profile: Profile): Promise<ApiResult<MeResponse>> {
    return this.request('PUT', '/api/me/character', profile);
  }

  setTimeZone(timeZone: string): Promise<ApiResult<MeResponse>> {
    return this.request('PUT', '/api/me/timezone', { timeZone });
  }

  importSave(saveCode: string): Promise<ApiResult<MeResponse>> {
    return this.request('POST', '/api/me/import', { saveCode });
  }

  deleteAccount(): Promise<ApiResult<undefined>> {
    return this.request('DELETE', '/api/me');
  }

  capacity(): Promise<ApiResult<CapacityResponse>> {
    return this.request('GET', '/api/capacity');
  }
}
