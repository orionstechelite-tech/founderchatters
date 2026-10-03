import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { ApplicationDetailClient } from './application-detail-client';

export const metadata: Metadata = {
  title: 'Application review · Admin · FounderChatters',
};

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Applications"
      required={ADMIN_PERMISSIONS.applicationsRead}
    >
      <ApplicationDetailClient id={id} />
    </AdminAppShell>
  );
}
