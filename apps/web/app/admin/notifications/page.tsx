import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { NotificationsScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Notifications · Admin · FounderChatters',
};

export default function AdminNotificationsPage() {
  return (
    <AdminAppShell
      activeItem="Notifications"
      required={ADMIN_PERMISSIONS.notificationsRead}
    >
      <NotificationsScreen />
    </AdminAppShell>
  );
}
