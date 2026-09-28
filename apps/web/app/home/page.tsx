import type { Metadata } from 'next';

import { HomeGate } from './home-gate';

export const metadata: Metadata = {
  title: 'Home · FounderChatters',
};

export default function HomePage() {
  return <HomeGate />;
}
