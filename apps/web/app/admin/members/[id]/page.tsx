import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { MemberDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Founder 360 · Admin · FounderChatters',
};

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Members"
      required={ADMIN_PERMISSIONS.membersRead}
    >
      <MemberDetailScreen id={id} />
    </AdminAppShell>
  );
}
