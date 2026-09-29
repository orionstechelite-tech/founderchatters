import type {
  DiscoverFoundersResponse,
  MemberFounderProfileResponse,
  MemberRequestResponse,
  OwnRequestsResponse,
  RequestDeletedResponse,
  SavedFounderMutationResponse,
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

export { authSessionRequest } from '../onboarding/onboarding-api';
