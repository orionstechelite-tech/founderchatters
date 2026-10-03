import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { AuditDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Audit event · Admin · FounderChatters',
};

export default async function AdminAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Audit Log"
      required={ADMIN_PERMISSIONS.auditRead}
    >
      <AuditDetailScreen id={id} />
    </AdminAppShell>
  );
}
