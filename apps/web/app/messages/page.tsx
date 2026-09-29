import type { Metadata } from 'next';

import { MemberAppShell } from '../member/member-app-shell';
import { MessagesGate } from './messages-gate';

export const metadata: Metadata = {
  title: 'Messages · FounderChatters',
};

export default function MessagesPage() {
  return (
    <MemberAppShell activeItem="Messages">
      <MessagesGate />
    </MemberAppShell>
  );
}
