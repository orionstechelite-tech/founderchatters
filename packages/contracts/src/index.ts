export const contractsPackageName = '@founderchatters/contracts';

export const AUTH_ERROR_CODES = {
  forbidden: 'AUTH_FORBIDDEN',
  invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  rateLimited: 'AUTH_RATE_LIMITED',
  sessionExpired: 'AUTH_SESSION_EXPIRED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export type AuthAccessState =
  | 'VERIFY_EMAIL'
  | 'APPLICATION'
  | 'ONBOARDING'
  | 'ACTIVE';

export type SignupRequest = {
  email: string;
  password: string;
};

export type SigninRequest = SignupRequest;

export type SafeUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  status: 'ACTIVE';
};

export type AuthSessionResponse = {
  user: SafeUser;
  access: {
    state: AuthAccessState;
    applicationStatus:
      | 'DRAFT'
      | 'SUBMITTED'
      | 'NEEDS_INFO'
      | 'APPROVED'
      | 'REJECTED'
      | null;
    onboardingCompleted: boolean;
  };
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
    fieldErrors: Record<string, string[]>;
  };
};
