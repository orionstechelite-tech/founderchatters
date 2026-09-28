interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fieldErrors?: Record<string, string[]>;
  };
}

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.founderchatters.com'
    : 'http://localhost:4000');

export async function postAuth<T>(path: string, body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new AuthApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}
