import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from './admin-app-shell';
import { OverviewScreen } from './admin-screens';

export const metadata: Metadata = {
  title: 'Command Center · Admin · FounderChatters',
};

export default function AdminOverviewPage() {
  return (
    <AdminAppShell
      activeItem="Overview"
      required={ADMIN_PERMISSIONS.overviewRead}
    >
      <OverviewScreen />
    </AdminAppShell>
  );
}
