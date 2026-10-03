import type { Metadata } from 'next';

import { SuspendedClient } from './suspended-client';

export const metadata: Metadata = {
  title: 'Account suspended · FounderChatters',
};

export default function SuspendedPage() {
  return <SuspendedClient />;
}
