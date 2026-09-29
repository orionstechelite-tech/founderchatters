import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { RequestDetailGate } from './request-detail-gate';

export const metadata: Metadata = {
  title: 'Request · FounderChatters',
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MemberAppShell activeItem="Ask">
      <RequestDetailGate requestId={id} />
    </MemberAppShell>
  );
}
