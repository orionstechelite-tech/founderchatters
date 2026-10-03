import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { RolesScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Roles · Admin · FounderChatters',
};

export default function AdminRolesPage() {
  return (
    <AdminAppShell
      activeItem="Admins & Roles"
      required={ADMIN_PERMISSIONS.rolesRead}
    >
      <RolesScreen />
    </AdminAppShell>
  );
}
