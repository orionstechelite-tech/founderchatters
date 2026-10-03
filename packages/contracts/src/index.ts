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

export const RESPONSE_TYPES = {
  advice: 'ADVICE',
  introductionOffer: 'INTRODUCTION_OFFER',
  privateChatOffer: 'PRIVATE_CHAT_OFFER',
} as const;

export type ResponseType = (typeof RESPONSE_TYPES)[keyof typeof RESPONSE_TYPES];

export const INTRODUCTION_STATUSES = {
  offered: 'OFFERED',
  consentPending: 'CONSENT_PENDING',
  introduced: 'INTRODUCED',
  declined: 'DECLINED',
  cancelled: 'CANCELLED',
} as const;

export type IntroductionStatus =
  (typeof INTRODUCTION_STATUSES)[keyof typeof INTRODUCTION_STATUSES];

export const HELP_RESPONSE_ERROR_CODES = {
  invalidInput: 'HELP_RESPONSE_INVALID_INPUT',
  notAllowed: 'HELP_RESPONSE_NOT_ALLOWED',
  introductionNotFound: 'INTRODUCTION_NOT_FOUND',
  introductionInvalidState: 'INTRODUCTION_INVALID_STATE',
} as const;

export type HelpResponseErrorCode =
  (typeof HELP_RESPONSE_ERROR_CODES)[keyof typeof HELP_RESPONSE_ERROR_CODES];

export const HELP_RESPONSE_LIMITS = {
  adviceMin: 20,
  adviceMax: 2000,
  personNameMin: 2,
  personNameMax: 160,
  reasonMax: 500,
  pageSizeDefault: 20,
  pageSizeMax: 50,
  pageMax: 10_000,
} as const;

export type CreateAdviceBody = {
  body: string;
};

export type CreateIntroductionBody = {
  personName: string;
  reason?: string | null;
  permissionConfirmed: true;
};

export type HelpResponseIntroduction = {
  id: string;
  status: IntroductionStatus;
  personName: string | null;
  reason: string | null;
  canConsent: boolean;
  canDecline: boolean;
  canCancel: boolean;
};

export type HelpResponsePrivateChat = {
  conversationId: string | null;
  canStart: boolean;
  canOpen: boolean;
};

export type MemberHelpResponse = {
  id: string;
  type: ResponseType;
  createdAt: string;
  author: MemberRequestAuthor | null;
  body: string | null;
  introduction: HelpResponseIntroduction | null;
  privateChat: HelpResponsePrivateChat | null;
  helpConfirmation: OwnerHelpConfirmation | null;
};

export type MemberHelpResponsesResponse = {
  responses: MemberHelpResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  viewerResponseTypes: ResponseType[];
  canOfferHelp: boolean;
};

export type HelpResponseMutationResponse = {
  response: MemberHelpResponse;
};

export const CONVERSATION_STATUSES = {
  active: 'ACTIVE',
  closed: 'CLOSED',
} as const;

export type ConversationStatus =
  (typeof CONVERSATION_STATUSES)[keyof typeof CONVERSATION_STATUSES];

export const MESSAGING_ERROR_CODES = {
  conversationNotFound: 'CONVERSATION_NOT_FOUND',
  invalidInput: 'MESSAGING_INVALID_INPUT',
  notAllowed: 'MESSAGING_NOT_ALLOWED',
  invalidState: 'MESSAGING_INVALID_STATE',
  idempotencyConflict: 'MESSAGING_IDEMPOTENCY_CONFLICT',
  rateLimited: 'MESSAGING_RATE_LIMITED',
} as const;

export type MessagingErrorCode =
  (typeof MESSAGING_ERROR_CODES)[keyof typeof MESSAGING_ERROR_CODES];

export const MESSAGING_LIMITS = {
  bodyMin: 1,
  bodyMax: 4000,
  searchMax: 100,
  pageSizeDefault: 20,
  pageSizeMax: 50,
  pageMax: 10_000,
  historyLimitDefault: 50,
  historyLimitMax: 100,
  sendPerWindow: 30,
  sendWindowSeconds: 60,
} as const;

export type CreateConversationBody = {
  privateChatOfferResponseId: string;
};

export type SendMessageBody = {
  clientMessageId: string;
  body: string;
};

export type MemberMessagingCounterpart = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  companyName: string;
  city: string | null;
  country: string | null;
};

export type ConversationRequestContext =
  | {
      available: true;
      id: string;
      type: RequestType;
      status: MemberRequestListStatus;
      headline: string;
      topics: MemberTopicRef[];
    }
  | {
      available: false;
    };

export type ConversationLatestMessage = {
  id: string;
  senderIsViewer: boolean;
  body: string;
  createdAt: string;
};

export type MemberConversationSummary = {
  id: string;
  status: ConversationStatus;
  updatedAt: string;
  counterpart: MemberMessagingCounterpart | null;
  requestContext: ConversationRequestContext;
  latestMessage: ConversationLatestMessage | null;
};

export type MemberConversationsResponse = {
  conversations: MemberConversationSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  q: string | null;
};

export type MemberConversation = MemberConversationSummary & {
  canSend: boolean;
};

export type MemberConversationResponse = {
  conversation: MemberConversation;
};

export type ConversationCreatedResponse = {
  conversation: MemberConversation;
};

export type MemberMessage = {
  id: string;
  senderId: string;
  createdAt: string;
  body: string | null;
  removed: boolean;
};

export type MemberMessagesResponse = {
  messages: MemberMessage[];
  nextBefore: string | null;
};

export type MessageSentResponse = {
  message: MemberMessage;
};

export const NOTIFICATION_ERROR_CODES = {
  invalidInput: 'NOTIFICATION_INVALID_INPUT',
  notFound: 'NOTIFICATION_NOT_FOUND',
} as const;

export type NotificationErrorCode =
  (typeof NOTIFICATION_ERROR_CODES)[keyof typeof NOTIFICATION_ERROR_CODES];

export const NOTIFICATION_TYPES = {
  requestAdvice: 'REQUEST_ADVICE',
  privateHelpOffer: 'PRIVATE_HELP_OFFER',
  introductionOffered: 'INTRODUCTION_OFFERED',
  introductionAccepted: 'INTRODUCTION_ACCEPTED',
  requestMessage: 'REQUEST_MESSAGE',
  contributionRecorded: 'CONTRIBUTION_RECORDED',
  applicationNeedsInfo: 'APPLICATION_NEEDS_INFO',
  applicationApproved: 'APPLICATION_APPROVED',
  applicationRejected: 'APPLICATION_REJECTED',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_LIMITS = {
  pageSizeDefault: 20,
  pageSizeMax: 50,
} as const;

export type MemberNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type MemberNotificationsResponse = {
  notifications: MemberNotification[];
  nextBefore: string | null;
};

export type MarkNotificationReadResponse = {
  notification: MemberNotification;
};

export type MarkAllNotificationsReadResponse = {
  updatedCount: number;
};

export const HELP_OUTCOMES = {
  helped: 'HELPED',
  stillTalking: 'STILL_TALKING',
  notHelpful: 'NOT_HELPFUL',
} as const;

export type HelpOutcome = (typeof HELP_OUTCOMES)[keyof typeof HELP_OUTCOMES];

export const HELP_CONFIRMATION_ERROR_CODES = {
  notFound: 'HELP_CONFIRMATION_NOT_FOUND',
  invalidInput: 'HELP_CONFIRMATION_INVALID_INPUT',
  notAllowed: 'HELP_CONFIRMATION_NOT_ALLOWED',
  invalidState: 'HELP_CONFIRMATION_INVALID_STATE',
  contributionNotEligible: 'CONTRIBUTION_NOT_ELIGIBLE',
  thankYouAlreadyExists: 'THANK_YOU_ALREADY_EXISTS',
} as const;

export type HelpConfirmationErrorCode =
  (typeof HELP_CONFIRMATION_ERROR_CODES)[keyof typeof HELP_CONFIRMATION_ERROR_CODES];

export const REPUTATION_ERROR_CODES = {
  invalidInput: 'REPUTATION_INVALID_INPUT',
} as const;

export type ReputationErrorCode =
  (typeof REPUTATION_ERROR_CODES)[keyof typeof REPUTATION_ERROR_CODES];

export const HELP_CONFIRMATION_LIMITS = {
  topicIdsMax: 3,
  thankYouMin: 1,
  thankYouMax: 500,
} as const;

export const REPUTATION_LIMITS = {
  pageSizeDefault: 20,
  pageSizeMax: 50,
  pageMax: 10_000,
  helpfulTopicsMax: 5,
} as const;

export const REPUTATION_HISTORY_LABELS = {
  ADVICE: 'Advice confirmed helpful',
  INTRODUCTION_OFFER: 'Introduction confirmed helpful',
  PRIVATE_CHAT_OFFER: 'Private help confirmed helpful',
} as const satisfies Record<ResponseType, string>;

export type CreateHelpConfirmationBody = {
  responseId: string;
  outcome: HelpOutcome;
  topicIds?: string[];
};

export type CreateThankYouBody = {
  body: string;
};

export type OwnerHelpConfirmation = {
  id: string | null;
  outcome: HelpOutcome | null;
  creditedResponseId: string | null;
  canConfirm: boolean;
  canUpdate: boolean;
  hasContribution: boolean;
  hasThankYou: boolean;
  canThank: boolean;
};

export type MemberHelpConfirmation = {
  id: string;
  requestId: string;
  outcome: HelpOutcome;
  creditedResponseId: string | null;
  helper: MemberRequestAuthor | null;
  topicIds: string[];
  hasContribution: boolean;
  hasThankYou: boolean;
  canThank: boolean;
};

export type HelpConfirmationMutationResponse = {
  confirmation: MemberHelpConfirmation;
};

export type ThankYouMutationResponse = {
  thankYou: {
    body: string;
    createdAt: string;
  };
};

export type ReputationTopic = MemberTopicRef & {
  count: number;
};

export type ReputationContribution = {
  id: string;
  type: ResponseType;
  label: string;
  topics: MemberTopicRef[];
  createdAt: string;
  confirmer: MemberRequestAuthor | null;
  thankYou: string | null;
  requestAvailable: boolean;
  requestId: string | null;
};

export type ReputationSummary = {
  foundersHelped: number;
  confirmedHelps: number;
  introductions: number;
  helpfulTopics: ReputationTopic[];
  mostRecognizedTopic: ReputationTopic | null;
};

export type MemberReputationResponse = {
  founder: MemberRequestAuthor;
  isSelf: boolean;
  summary: ReputationSummary;
  contributions: ReputationContribution[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
