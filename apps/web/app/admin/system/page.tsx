import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { SystemScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'System health · Admin · FounderChatters',
};

export default function AdminSystemPage() {
  return (
    <AdminAppShell
      activeItem="System Health"
      required={ADMIN_PERMISSIONS.systemRead}
    >
      <SystemScreen />
    </AdminAppShell>
  );
}
