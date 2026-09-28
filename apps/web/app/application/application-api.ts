import type { AuthSessionResponse } from '@founderchatters/contracts';

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fieldErrors?: Record<string, string[]>;
  };
}

export class ApplicationApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApplicationApiError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.founderchatters.com'
    : 'http://localhost:4000');

export async function applicationRequest<T>(
  path = 'me',
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/application/${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApplicationApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new ApplicationApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}

export async function authSessionRequest(): Promise<AuthSessionResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/session`, {
      credentials: 'include',
    });
  } catch {
    throw new ApplicationApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }
  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new ApplicationApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as AuthSessionResponse;
}
