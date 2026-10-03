import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { ReputationScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Reputation · Admin · FounderChatters',
};

export default function AdminReputationPage() {
  return (
    <AdminAppShell
      activeItem="Reputation"
      required={ADMIN_PERMISSIONS.reputationRead}
    >
      <ReputationScreen />
    </AdminAppShell>
  );
}
