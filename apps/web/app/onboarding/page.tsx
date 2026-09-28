import type { Metadata } from 'next';

import { OnboardingClient } from './onboarding-client';

export const metadata: Metadata = {
  title: 'Onboarding · FounderChatters',
};

export default function OnboardingPage() {
  return <OnboardingClient />;
}
