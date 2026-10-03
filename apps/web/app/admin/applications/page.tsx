import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { ApplicationsQueueClient } from './applications-queue-client';

export const metadata: Metadata = {
  title: 'Applications · Admin · FounderChatters',
};

export default function AdminApplicationsPage() {
  return (
    <AdminAppShell
      activeItem="Applications"
      required={ADMIN_PERMISSIONS.applicationsRead}
    >
      <ApplicationsQueueClient />
    </AdminAppShell>
  );
}
