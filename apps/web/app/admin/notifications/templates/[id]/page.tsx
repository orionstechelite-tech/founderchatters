import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../../admin-app-shell';
import { TemplateDetailScreen } from '../../../admin-screens';

export const metadata: Metadata = {
  title: 'Notification template · Admin · FounderChatters',
};

export default async function AdminTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminAppShell
      activeItem="Notifications"
      required={ADMIN_PERMISSIONS.notificationsRead}
    >
      <TemplateDetailScreen id={id} />
    </AdminAppShell>
  );
}
