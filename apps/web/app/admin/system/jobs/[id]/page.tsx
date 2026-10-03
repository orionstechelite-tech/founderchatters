import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../../admin-app-shell';
import { JobDetailScreen } from '../../../admin-screens';

export const metadata: Metadata = {
  title: 'Failed job · Admin · FounderChatters',
};

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="System Health"
      required={ADMIN_PERMISSIONS.jobsRead}
    >
      <JobDetailScreen id={id} />
    </AdminAppShell>
  );
}
