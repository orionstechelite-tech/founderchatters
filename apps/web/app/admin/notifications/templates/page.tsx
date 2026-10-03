import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { TemplatesScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Notification templates · Admin · FounderChatters',
};

export default function AdminTemplatesPage() {
  return (
    <AdminAppShell
      activeItem="Notifications"
      required={ADMIN_PERMISSIONS.notificationsRead}
    >
      <TemplatesScreen />
    </AdminAppShell>
  );
}
