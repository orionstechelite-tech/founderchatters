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

export const ADMIN_ERROR_CODES = {
  permissionDenied: 'ADMIN_PERMISSION_DENIED',
  actionInvalidState: 'ADMIN_ACTION_INVALID_STATE',
} as const;

export type AdminErrorCode =
  (typeof ADMIN_ERROR_CODES)[keyof typeof ADMIN_ERROR_CODES];

export const ADMIN_PERMISSIONS = {
  applicationsRead: 'admin.applications.read',
  applicationsNeedsInfo: 'admin.applications.needs_info',
  applicationsApprove: 'admin.applications.approve',
  applicationsReject: 'admin.applications.reject',
} as const;

export type AdminPermission =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ADMIN_ROLES = {
  superAdmin: 'SUPER_ADMIN',
  applicationReviewer: 'APPLICATION_REVIEWER',
  operations: 'OPERATIONS',
  moderator: 'MODERATOR',
  support: 'SUPPORT',
  analystReadonly: 'ANALYST_READONLY',
} as const;

export type AdminRoleKey = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES];

export const ADMIN_APPLICATION_QUEUE_STATUSES = [
  'SUBMITTED',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
] as const;

export type AdminApplicationQueueStatus =
  (typeof ADMIN_APPLICATION_QUEUE_STATUSES)[number];

export type AdminApplicationQueueItem = {
  id: string;
  status: AdminApplicationQueueStatus;
  eligibilityRole: ApplicationEligibilityRole | null;
  companyName: string | null;
  roleTitle: string | null;
  city: string | null;
  country: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
  applicantEmail: string;
  emailVerified: boolean;
};

export type AdminApplicationQueueResponse = {
  applications: AdminApplicationQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  status: AdminApplicationQueueStatus;
  country: string | null;
  countries: string[];
};

export type AdminApplicationCapabilities = {
  needsInfo: boolean;
  approve: boolean;
  reject: boolean;
};

export type AdminApplicationDetail = {
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
  latestReviewNote: string | null;
  applicant: {
    email: string;
    emailVerified: boolean;
  };
};

export type AdminApplicationDetailResponse = {
  application: AdminApplicationDetail;
  capabilities: AdminApplicationCapabilities;
};

export type AdminApplicationDecisionRequest = {
  note?: string;
};
