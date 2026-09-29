import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { MessagesGate } from '../messages-gate';

export const metadata: Metadata = {
  title: 'Conversation · FounderChatters',
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <MemberAppShell activeItem="Messages">
      <MessagesGate conversationId={conversationId} />
    </MemberAppShell>
  );
}
