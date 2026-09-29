import type { Metadata } from 'next';

import { MemberAppShell } from '../member/member-app-shell';
import { AskGate } from './ask-gate';

export const metadata: Metadata = {
  title: 'Ask · FounderChatters',
};

export default function AskPage() {
  return (
    <MemberAppShell activeItem="Ask">
      <AskGate />
    </MemberAppShell>
  );
}
