export const contractsPackageName = '@founderchatters/contracts';

export const AUTH_ERROR_CODES = {
  emailNotVerified: 'AUTH_EMAIL_NOT_VERIFIED',
  forbidden: 'AUTH_FORBIDDEN',
  invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  rateLimited: 'AUTH_RATE_LIMITED',
  resetTokenExpired: 'RESET_TOKEN_EXPIRED',
  resetTokenInvalid: 'RESET_TOKEN_INVALID',
  sessionExpired: 'AUTH_SESSION_EXPIRED',
  verifyTokenExpired: 'VERIFY_TOKEN_EXPIRED',
  verifyTokenInvalid: 'VERIFY_TOKEN_INVALID',
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

export type EmailRequest = {
  email: string;
};

export type VerifyEmailRequest = {
  token: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
  confirmPassword: string;
};

export type AcceptedResponse = {
  accepted: true;
};

export type VerifyEmailResponse = {
  verified: true;
};

export type ResetPasswordResponse = {
  passwordReset: true;
};

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

export const APPLICATION_ERROR_CODES = {
  alreadySubmitted: 'APPLICATION_ALREADY_SUBMITTED',
  invalidState: 'APPLICATION_INVALID_STATE',
  needsInfo: 'APPLICATION_NEEDS_INFO',
  notFound: 'APPLICATION_NOT_FOUND',
} as const;

export type ApplicationErrorCode =
  (typeof APPLICATION_ERROR_CODES)[keyof typeof APPLICATION_ERROR_CODES];

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'NEEDS_INFO'
  | 'APPROVED'
  | 'REJECTED';

export const APPLICATION_ELIGIBILITY_ROLES = {
  founder: 'FOUNDER_COFOUNDER',
  operator: 'FOUNDING_TEAM_OPERATOR',
  notBuilding: 'NOT_CURRENTLY_BUILDING',
} as const;

export type ApplicationEligibilityRole =
  (typeof APPLICATION_ELIGIBILITY_ROLES)[keyof typeof APPLICATION_ELIGIBILITY_ROLES];

export type UpdateFounderApplicationRequest = {
  eligibilityRole?: ApplicationEligibilityRole;
  companyName?: string;
  roleTitle?: string;
  website?: string | null;
  city?: string;
  country?: string;
  buildingSummary?: string;
};

export type FounderApplication = {
  id: string;
  status: ApplicationStatus;
  eligibilityRole: ApplicationEligibilityRole | null;
  companyName: string | null;
  roleTitle: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  buildingSummary: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
  needsInfoNote: string | null;
};

export type FounderApplicationResponse = {
  application: FounderApplication;
};
