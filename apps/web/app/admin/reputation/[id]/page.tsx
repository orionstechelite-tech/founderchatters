import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { ReputationDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Contribution · Admin · FounderChatters',
};

export default async function AdminReputationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Reputation"
      required={ADMIN_PERMISSIONS.reputationRead}
    >
      <ReputationDetailScreen id={id} />
    </AdminAppShell>
  );
}
