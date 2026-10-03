import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { ReportsQueueClient } from './reports-queue-client';

export const metadata: Metadata = {
  title: 'Reports · Admin · FounderChatters',
};

export default function AdminReportsPage() {
  return (
    <AdminAppShell
      activeItem="Reports"
      required={ADMIN_PERMISSIONS.reportsRead}
    >
      <ReportsQueueClient />
    </AdminAppShell>
  );
}
