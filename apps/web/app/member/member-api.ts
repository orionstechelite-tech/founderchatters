import type {
  DiscoverFoundersResponse,
  MemberFounderProfileResponse,
  SavedFounderMutationResponse,
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

export { authSessionRequest } from '../onboarding/onboarding-api';
