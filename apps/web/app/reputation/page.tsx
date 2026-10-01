import type { Metadata } from 'next';

import { MemberAppShell } from '../member/member-app-shell';
import { ReputationClient } from './reputation-client';

export const metadata: Metadata = {
  title: 'Reputation · FounderChatters',
};

export default function ReputationPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <ReputationClient />
    </MemberAppShell>
  );
}
