import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { FounderProfileClient } from './founder-profile-client';

export const metadata: Metadata = {
  title: 'Founder profile · FounderChatters',
};

export default async function FounderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MemberAppShell activeItem="Profile">
      <FounderProfileClient founderId={id} key={id} />
    </MemberAppShell>
  );
}
