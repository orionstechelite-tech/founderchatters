import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { RequestsScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Requests · Admin · FounderChatters',
};

export default function AdminRequestsPage() {
  return (
    <AdminAppShell
      activeItem="Requests"
      required={ADMIN_PERMISSIONS.requestsRead}
    >
      <RequestsScreen />
    </AdminAppShell>
  );
}
