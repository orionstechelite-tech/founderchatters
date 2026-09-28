import type {
  AuthSessionResponse,
  OnboardingCompleteResponse,
  OnboardingProfileResponse,
} from '@founderchatters/contracts';

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fieldErrors?: Record<string, string[]>;
  };
}

export class OnboardingApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'OnboardingApiError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.founderchatters.com'
    : 'http://localhost:4000');

export async function onboardingRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new OnboardingApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }
  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new OnboardingApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}

export function getOnboardingProfile(): Promise<OnboardingProfileResponse> {
  return onboardingRequest<OnboardingProfileResponse>('me/profile');
}

export function saveOnboardingProfile(
  body: object,
): Promise<OnboardingProfileResponse> {
  return onboardingRequest<OnboardingProfileResponse>('me/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function saveOnboardingExpertise(
  body: object,
): Promise<OnboardingProfileResponse> {
  return onboardingRequest<OnboardingProfileResponse>('me/expertise', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function saveOnboardingNeeds(
  body: object,
): Promise<OnboardingProfileResponse> {
  return onboardingRequest<OnboardingProfileResponse>('me/needs', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function completeOnboarding(): Promise<OnboardingCompleteResponse> {
  return onboardingRequest<OnboardingCompleteResponse>(
    'me/onboarding/complete',
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function authSessionRequest(): Promise<AuthSessionResponse> {
  return onboardingRequest<AuthSessionResponse>('auth/session');
}
