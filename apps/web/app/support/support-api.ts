import type { CreatePublicSupportCaseResponse } from '@founderchatters/contracts';

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fieldErrors?: Record<string, string[]>;
  };
}

export class PublicSupportApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'PublicSupportApiError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export async function createPublicSupportCase(body: {
  category: string;
  email: string;
  subject: string;
  message: string;
}): Promise<CreatePublicSupportCaseResponse> {
  if (!API_URL) {
    throw new PublicSupportApiError(
      'NETWORK_ERROR',
      'Support is temporarily unavailable. Try again later.',
    );
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/support/cases`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PublicSupportApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as
    CreatePublicSupportCaseResponse | ApiErrorBody;
  if (!response.ok) {
    const error = payload as ApiErrorBody;
    throw new PublicSupportApiError(
      error.error?.code ?? 'UNKNOWN_ERROR',
      error.error?.message ?? 'Something went wrong. Please try again.',
      error.error?.fieldErrors,
    );
  }
  return payload as CreatePublicSupportCaseResponse;
}
