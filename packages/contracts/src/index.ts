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

export const ONBOARDING_ERROR_CODES = {
  incomplete: 'ONBOARDING_INCOMPLETE',
} as const;

export type OnboardingErrorCode =
  (typeof ONBOARDING_ERROR_CODES)[keyof typeof ONBOARDING_ERROR_CODES];

export type OnboardingTopic = {
  slug: string;
  label: string;
};

export const ONBOARDING_EXPERTISE_TOPICS = [
  { slug: 'b2b-sales', label: 'B2B sales' },
  { slug: 'marketplace-gtm', label: 'Marketplace GTM' },
  { slug: 'product', label: 'Product' },
  { slug: 'engineering-hiring', label: 'Engineering hiring' },
  { slug: 'fundraising', label: 'Fundraising' },
  { slug: 'operations', label: 'Operations' },
  { slug: 'india-market', label: 'India market' },
  { slug: 'travel-mobility', label: 'Travel / mobility' },
  { slug: 'growth-marketing', label: 'Growth marketing' },
  { slug: 'partnerships', label: 'Partnerships' },
  { slug: 'pricing', label: 'Pricing' },
  { slug: 'founder-operations', label: 'Founder operations' },
] as const satisfies readonly OnboardingTopic[];

export const ONBOARDING_NEED_TOPICS = [
  { slug: 'gtm', label: 'GTM' },
  { slug: 'fundraising', label: 'Fundraising' },
  { slug: 'hiring', label: 'Hiring' },
  { slug: 'pricing', label: 'Pricing' },
  { slug: 'product', label: 'Product' },
  { slug: 'tech', label: 'Tech' },
  { slug: 'introductions', label: 'Introductions' },
  { slug: 'market-entry', label: 'Market entry' },
] as const satisfies readonly OnboardingTopic[];

const TAXONOMY_BY_SLUG = new Map<string, OnboardingTopic>();
for (const topic of [
  ...ONBOARDING_EXPERTISE_TOPICS,
  ...ONBOARDING_NEED_TOPICS,
]) {
  if (!TAXONOMY_BY_SLUG.has(topic.slug)) {
    TAXONOMY_BY_SLUG.set(topic.slug, topic);
  }
}

export const ONBOARDING_TAXONOMY_TOPICS = [
  ...TAXONOMY_BY_SLUG.values(),
] as const;

export const ONBOARDING_LIMITS = {
  displayName: 100,
  companyName: 120,
  industry: 120,
  stage: 80,
  description: 280,
  website: 2048,
  city: 100,
  country: 100,
  customExpertise: 120,
  currentNeedTextMin: 20,
  currentNeedTextMax: 500,
  expertiseMin: 1,
  expertiseMax: 5,
  needsMax: 3,
} as const;

export type OnboardingTopicRef = {
  id: string;
  slug: string;
  label: string;
};

export type OnboardingCompany = {
  name: string;
  website: string | null;
  description: string | null;
  stage: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
};

export type OnboardingProfile = {
  displayName: string | null;
  city: string | null;
  country: string | null;
  customExpertise: string | null;
  currentNeedText: string | null;
  onboardingCompleted: boolean;
};

export type OnboardingProfileResponse = {
  profile: OnboardingProfile;
  company: OnboardingCompany | null;
  applicationRoleTitle: string | null;
  expertise: OnboardingTopicRef[];
  needs: OnboardingTopicRef[];
  topics: {
    expertise: OnboardingTopicRef[];
    needs: OnboardingTopicRef[];
  };
};

export type UpdateOnboardingProfileRequest = {
  displayName?: string;
  city?: string | null;
  country?: string | null;
  company?: {
    name?: string;
    website?: string | null;
    description?: string | null;
    stage?: string | null;
    industry?: string | null;
    city?: string | null;
    country?: string | null;
  };
};

export type UpdateOnboardingExpertiseRequest = {
  topicIds: string[];
  customExpertise?: string | null;
};

export type UpdateOnboardingNeedsRequest = {
  topicIds: string[];
  currentNeedText: string;
};

export type OnboardingCompleteResponse = {
  completed: true;
  onboardingCompletedAt: string;
};

export const FOUNDER_ERROR_CODES = {
  notFound: 'FOUNDER_NOT_FOUND',
  invalidSave: 'FOUNDER_INVALID_SAVE',
  invalidQuery: 'FOUNDER_INVALID_QUERY',
} as const;

export type FounderErrorCode =
  (typeof FOUNDER_ERROR_CODES)[keyof typeof FOUNDER_ERROR_CODES];

export const DISCOVER_LIMITS = {
  queryMax: 100,
  pageSizeDefault: 20,
  pageSizeMax: 50,
  pageMax: 10_000,
} as const;

export type MemberTopicRef = {
  id: string;
  slug: string;
  label: string;
};

export type MemberCompanySummary = {
  name: string;
  website: string | null;
  description: string | null;
  stage: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
};

export type DiscoverFounder = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  companyName: string;
  industry: string | null;
  stage: string | null;
  expertise: MemberTopicRef[];
  customExpertise: string | null;
  savedByMe: boolean;
};

export type DiscoverFoundersResponse = {
  founders: DiscoverFounder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  savedCount: number;
  q: string | null;
  country: string | null;
  industry: string | null;
  stage: string | null;
  expertiseTopicId: string | null;
  saved: boolean | null;
  expertiseTopics: MemberTopicRef[];
};

export type MemberFounderProfile = {
  id: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  company: MemberCompanySummary;
  expertise: MemberTopicRef[];
  customExpertise: string | null;
  currentNeedText: string | null;
  needs: MemberTopicRef[];
  savedByMe: boolean;
  memberSinceYear: number | null;
  isSelf: boolean;
};

export type MemberFounderProfileResponse = {
  founder: MemberFounderProfile;
};

export type SavedFoundersResponse = {
  founders: DiscoverFounder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SavedFounderMutationResponse = {
  saved: boolean;
  savedCount: number;
};

export const REQUEST_ERROR_CODES = {
  notFound: 'REQUEST_NOT_FOUND',
  forbidden: 'REQUEST_FORBIDDEN',
  limitReached: 'REQUEST_LIMIT_REACHED',
  invalidState: 'REQUEST_INVALID_STATE',
  publishFailed: 'REQUEST_PUBLISH_FAILED',
  invalidInput: 'REQUEST_INVALID_INPUT',
} as const;

export type RequestErrorCode =
  (typeof REQUEST_ERROR_CODES)[keyof typeof REQUEST_ERROR_CODES];

export const REQUEST_TYPES = {
  ask: 'ASK',
  feedback: 'FEEDBACK',
  introduction: 'INTRODUCTION',
  collaboration: 'COLLABORATION',
} as const;

export type RequestType = (typeof REQUEST_TYPES)[keyof typeof REQUEST_TYPES];

export const REQUEST_STATUSES = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  resolved: 'RESOLVED',
  deletedByAuthor: 'DELETED_BY_AUTHOR',
  moderatedRemoved: 'MODERATED_REMOVED',
} as const;

export type RequestStatus =
  (typeof REQUEST_STATUSES)[keyof typeof REQUEST_STATUSES];

export const MEMBER_REQUEST_LIST_STATUSES = [
  REQUEST_STATUSES.draft,
  REQUEST_STATUSES.published,
  REQUEST_STATUSES.resolved,
] as const;

export type MemberRequestListStatus =
  (typeof MEMBER_REQUEST_LIST_STATUSES)[number];

export const REQUEST_URGENCIES = {
  today: 'TODAY',
  thisWeek: 'THIS_WEEK',
  noRush: 'NO_RUSH',
} as const;

export type RequestUrgency =
  (typeof REQUEST_URGENCIES)[keyof typeof REQUEST_URGENCIES];

export const REQUEST_URGENCY_LABELS = {
  TODAY: 'Today',
  THIS_WEEK: 'This week',
  NO_RUSH: 'No rush',
} as const satisfies Record<RequestUrgency, string>;

export const REQUEST_LIMITS = {
  openPublished: 3,
  headlineMax: 160,
  headlinePublishMin: 10,
  contextMax: 2000,
  contextPublishMin: 30,
  whoCouldHelpMax: 300,
  topicIdsMax: 3,
  pageSizeDefault: 20,
  pageSizeMax: 50,
  pageMax: 10_000,
} as const;

export type UpsertRequestBody = {
  type?: RequestType;
  headline?: string;
  context?: string;
  whoCouldHelp?: string | null;
  urgency?: RequestUrgency | null;
  topicIds?: string[];
};

export type CreateRequestBody = UpsertRequestBody & {
  type: RequestType;
};

export type MemberRequestAuthor = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  companyName: string;
  city: string | null;
  country: string | null;
};

export type MemberRequest = {
  id: string;
  type: RequestType;
  status: MemberRequestListStatus;
  headline: string;
  context: string;
  whoCouldHelp: string | null;
  urgency: RequestUrgency | null;
  topics: MemberTopicRef[];
  responseCount: number;
  publishedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: MemberRequestAuthor;
};

export type MemberRequestResponse = {
  request: MemberRequest;
};

export type OwnRequestsResponse = {
  requests: MemberRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  status: MemberRequestListStatus | null;
  availableTopics: MemberTopicRef[];
};

export type RequestDeletedResponse = {
  deleted: true;
};
