import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { AdminsScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Admins · Admin · FounderChatters',
};

export default function AdminUsersPage() {
  return (
    <AdminAppShell
      activeItem="Admins & Roles"
      required={ADMIN_PERMISSIONS.adminsRead}
    >
      <AdminsScreen />
    </AdminAppShell>
  );
}
