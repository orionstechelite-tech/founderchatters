import type { Metadata } from 'next';

import { ApplicationClient } from './application-client';

export const metadata: Metadata = {
  title: 'Founder application · FounderChatters',
};

export default function ApplicationPage() {
  return <ApplicationClient />;
}
