import type {
  ConversationCreatedResponse,
  CreateHelpConfirmationBody,
  DiscoverFoundersResponse,
  HelpConfirmationMutationResponse,
  HelpResponseMutationResponse,
  MemberConversationResponse,
  MemberConversationsResponse,
  MemberFounderProfileResponse,
  MemberHelpResponsesResponse,
  MemberMessagesResponse,
  MemberNotificationsResponse,
  MemberReputationResponse,
  MemberRequestResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  MemberAccountSettingsResponse,
  MemberProfileSettingsResponse,
  MemberSessionsResponse,
  MessageSentResponse,
  OtherSessionsRevokedResponse,
  OwnRequestsResponse,
  RequestDeletedResponse,
  SavedFounderMutationResponse,
  SessionRevokedResponse,
  ThankYouMutationResponse,
  UpdateMemberProfileSettingsRequest,
  ChangePasswordRequest,
  ChangePasswordResponse,
  UpsertRequestBody,
} from '@founderchatters/contracts';

import {
  OnboardingApiError,
  onboardingRequest,
} from '../onboarding/onboarding-api';

export class MemberApiError extends OnboardingApiError {
  constructor(
    code: string,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(code, message, fieldErrors);
    this.name = 'MemberApiError';
  }
}

export type DiscoverQueryInput = {
  page?: number;
  q?: string;
  country?: string | null;
  industry?: string | null;
  stage?: string | null;
  expertiseTopicId?: string | null;
  saved?: boolean | null;
};

function queryString(input: DiscoverQueryInput): string {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set('page', String(input.page));
  if (input.q) params.set('q', input.q);
  if (input.country) params.set('country', input.country);
  if (input.industry) params.set('industry', input.industry);
  if (input.stage) params.set('stage', input.stage);
  if (input.expertiseTopicId) {
    params.set('expertiseTopicId', input.expertiseTopicId);
  }
  if (input.saved === true) params.set('saved', 'true');
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function listFounders(
  input: DiscoverQueryInput = {},
): Promise<DiscoverFoundersResponse> {
  return onboardingRequest<DiscoverFoundersResponse>(
    `founders${queryString(input)}`,
  );
}

export function getFounderProfile(
  id: string,
): Promise<MemberFounderProfileResponse> {
  return onboardingRequest<MemberFounderProfileResponse>(
    `founders/${encodeURIComponent(id)}`,
  );
}

export function saveFounder(id: string): Promise<SavedFounderMutationResponse> {
  return onboardingRequest<SavedFounderMutationResponse>(
    `founders/${encodeURIComponent(id)}/save`,
    { method: 'POST' },
  );
}

export function unsaveFounder(
  id: string,
): Promise<SavedFounderMutationResponse> {
  return onboardingRequest<SavedFounderMutationResponse>(
    `founders/${encodeURIComponent(id)}/save`,
    { method: 'DELETE' },
  );
}

export function listOwnRequests(status?: string): Promise<OwnRequestsResponse> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return onboardingRequest<OwnRequestsResponse>(`requests${suffix}`);
}

export function getRequest(id: string): Promise<MemberRequestResponse> {
  return onboardingRequest<MemberRequestResponse>(
    `requests/${encodeURIComponent(id)}`,
  );
}

export function createRequest(
  body: UpsertRequestBody & { type: NonNullable<UpsertRequestBody['type']> },
): Promise<MemberRequestResponse> {
  return onboardingRequest<MemberRequestResponse>('requests', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchRequest(
  id: string,
  body: UpsertRequestBody,
): Promise<MemberRequestResponse> {
  return onboardingRequest<MemberRequestResponse>(
    `requests/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function publishRequest(id: string): Promise<MemberRequestResponse> {
  return onboardingRequest<MemberRequestResponse>(
    `requests/${encodeURIComponent(id)}/publish`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function resolveRequest(id: string): Promise<MemberRequestResponse> {
  return onboardingRequest<MemberRequestResponse>(
    `requests/${encodeURIComponent(id)}/resolve`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function deleteRequest(id: string): Promise<RequestDeletedResponse> {
  return onboardingRequest<RequestDeletedResponse>(
    `requests/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export function listRequestResponses(
  id: string,
): Promise<MemberHelpResponsesResponse> {
  return onboardingRequest<MemberHelpResponsesResponse>(
    `requests/${encodeURIComponent(id)}/responses`,
  );
}

export function createAdviceResponse(
  id: string,
  body: string,
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `requests/${encodeURIComponent(id)}/responses/advice`,
    { method: 'POST', body: JSON.stringify({ body }) },
  );
}

export function createIntroductionResponse(
  id: string,
  input: {
    personName: string;
    reason: string;
    permissionConfirmed: boolean;
  },
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `requests/${encodeURIComponent(id)}/responses/introduction`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function createPrivateChatResponse(
  id: string,
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `requests/${encodeURIComponent(id)}/responses/private-chat`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function consentIntroduction(
  id: string,
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `introductions/${encodeURIComponent(id)}/consent`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function declineIntroduction(
  id: string,
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `introductions/${encodeURIComponent(id)}/decline`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function cancelIntroduction(
  id: string,
): Promise<HelpResponseMutationResponse> {
  return onboardingRequest<HelpResponseMutationResponse>(
    `introductions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function listConversations(
  input: {
    page?: number;
    q?: string;
  } = {},
): Promise<MemberConversationsResponse> {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set('page', String(input.page));
  if (input.q) params.set('q', input.q);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return onboardingRequest<MemberConversationsResponse>(
    `conversations${suffix}`,
  );
}

export function createConversation(
  privateChatOfferResponseId: string,
): Promise<ConversationCreatedResponse> {
  return onboardingRequest<ConversationCreatedResponse>('conversations', {
    method: 'POST',
    body: JSON.stringify({ privateChatOfferResponseId }),
  });
}

export function getConversation(
  id: string,
): Promise<MemberConversationResponse> {
  return onboardingRequest<MemberConversationResponse>(
    `conversations/${encodeURIComponent(id)}`,
  );
}

export function listConversationMessages(
  id: string,
  input: { before?: string; limit?: number } = {},
): Promise<MemberMessagesResponse> {
  const params = new URLSearchParams();
  if (input.before) params.set('before', input.before);
  if (input.limit) params.set('limit', String(input.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return onboardingRequest<MemberMessagesResponse>(
    `conversations/${encodeURIComponent(id)}/messages${suffix}`,
  );
}

export function sendConversationMessage(
  id: string,
  input: { clientMessageId: string; body: string },
): Promise<MessageSentResponse> {
  return onboardingRequest<MessageSentResponse>(
    `conversations/${encodeURIComponent(id)}/messages`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function createHelpConfirmation(
  requestId: string,
  body: CreateHelpConfirmationBody,
): Promise<HelpConfirmationMutationResponse> {
  return onboardingRequest<HelpConfirmationMutationResponse>(
    `requests/${encodeURIComponent(requestId)}/help-confirmations`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function createThankYouNote(
  confirmationId: string,
  body: string,
): Promise<ThankYouMutationResponse> {
  return onboardingRequest<ThankYouMutationResponse>(
    `help-confirmations/${encodeURIComponent(confirmationId)}/thank-you`,
    { method: 'POST', body: JSON.stringify({ body }) },
  );
}

export function listNotifications(
  input: { before?: string; limit?: number } = {},
): Promise<MemberNotificationsResponse> {
  const params = new URLSearchParams();
  if (input.before) params.set('before', input.before);
  if (input.limit) params.set('limit', String(input.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return onboardingRequest<MemberNotificationsResponse>(
    `notifications${suffix}`,
  );
}

export function markNotificationRead(
  id: string,
): Promise<MarkNotificationReadResponse> {
  return onboardingRequest<MarkNotificationReadResponse>(
    `notifications/${encodeURIComponent(id)}/read`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResponse> {
  return onboardingRequest<MarkAllNotificationsReadResponse>(
    'notifications/read-all',
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function getProfileSettings(): Promise<MemberProfileSettingsResponse> {
  return onboardingRequest<MemberProfileSettingsResponse>(
    'me/settings/profile',
  );
}

export function updateProfileSettings(
  body: UpdateMemberProfileSettingsRequest,
): Promise<MemberProfileSettingsResponse> {
  return onboardingRequest<MemberProfileSettingsResponse>(
    'me/settings/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function getAccountSettings(): Promise<MemberAccountSettingsResponse> {
  return onboardingRequest<MemberAccountSettingsResponse>(
    'me/settings/account',
  );
}

export function listMemberSessions(): Promise<MemberSessionsResponse> {
  return onboardingRequest<MemberSessionsResponse>('me/sessions');
}

export function revokeMemberSession(
  sessionId: string,
): Promise<SessionRevokedResponse> {
  return onboardingRequest<SessionRevokedResponse>(
    `me/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

export function revokeOtherMemberSessions(): Promise<OtherSessionsRevokedResponse> {
  return onboardingRequest<OtherSessionsRevokedResponse>(
    'me/sessions/revoke-others',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function changeMemberPassword(
  body: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  return onboardingRequest<ChangePasswordResponse>('me/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function signOutMember(): Promise<void> {
  return onboardingRequest<void>('auth/signout', {
    method: 'POST',
  });
}

export function getMyReputation(
  input: { page?: number; pageSize?: number } = {},
): Promise<MemberReputationResponse> {
  return onboardingRequest<MemberReputationResponse>(
    `me/reputation${reputationQuery(input)}`,
  );
}

export function getFounderReputation(
  id: string,
  input: { page?: number; pageSize?: number } = {},
): Promise<MemberReputationResponse> {
  return onboardingRequest<MemberReputationResponse>(
    `founders/${encodeURIComponent(id)}/reputation${reputationQuery(input)}`,
  );
}

function reputationQuery(input: { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set('page', String(input.page));
  if (input.pageSize) params.set('pageSize', String(input.pageSize));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export { authSessionRequest } from '../onboarding/onboarding-api';
