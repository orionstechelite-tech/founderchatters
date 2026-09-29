import type { Metadata } from 'next';

import { MemberAppShell } from '../member/member-app-shell';
import { DiscoverClient } from './discover-client';

export const metadata: Metadata = {
  title: 'Discover · FounderChatters',
};

export default function DiscoverPage() {
  return (
    <MemberAppShell activeItem="Discover">
      <DiscoverClient />
    </MemberAppShell>
  );
}
