import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
import { JobsScreen } from '../../admin-screens';

export const metadata: Metadata = {
  title: 'Failed jobs · Admin · FounderChatters',
};

export default function AdminJobsPage() {
  return (
    <AdminAppShell
      activeItem="System Health"
      required={ADMIN_PERMISSIONS.jobsRead}
    >
      <JobsScreen />
    </AdminAppShell>
  );
}
