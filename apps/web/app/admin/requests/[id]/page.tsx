import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { RequestDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Request · Admin · FounderChatters',
};

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Requests"
      required={ADMIN_PERMISSIONS.requestsRead}
    >
      <RequestDetailScreen id={id} />
    </AdminAppShell>
  );
}
