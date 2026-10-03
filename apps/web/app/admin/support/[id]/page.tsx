import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { SupportDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Support case · Admin · FounderChatters',
};

export default async function AdminSupportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Support & Appeals"
      required={ADMIN_PERMISSIONS.supportRead}
    >
      <SupportDetailScreen id={id} />
    </AdminAppShell>
  );
}
