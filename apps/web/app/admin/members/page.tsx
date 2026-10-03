import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { MembersScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Members · Admin · FounderChatters',
};

export default function AdminMembersPage() {
  return (
    <AdminAppShell
      activeItem="Members"
      required={ADMIN_PERMISSIONS.membersRead}
    >
      <MembersScreen />
    </AdminAppShell>
  );
}
