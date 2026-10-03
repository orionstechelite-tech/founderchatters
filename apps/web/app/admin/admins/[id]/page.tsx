import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { AdminUserDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Admin user · Admin · FounderChatters',
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Admins & Roles"
      required={ADMIN_PERMISSIONS.adminsRead}
    >
      <AdminUserDetailScreen id={id} />
    </AdminAppShell>
  );
}
