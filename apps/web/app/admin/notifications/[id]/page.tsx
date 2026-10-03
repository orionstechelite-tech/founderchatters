import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { NotificationDetailScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Notification delivery · Admin · FounderChatters',
};

export default async function AdminNotificationDetailPage({
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
      <NotificationDetailScreen id={id} />
    </AdminAppShell>
  );
}
