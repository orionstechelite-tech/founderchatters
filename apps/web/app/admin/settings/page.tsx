import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { SettingsScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Platform settings · Admin · FounderChatters',
};

export default function AdminSettingsPage() {
  return (
    <AdminAppShell
      activeItem="Platform Settings"
      required={ADMIN_PERMISSIONS.settingsRead}
    >
      <SettingsScreen />
    </AdminAppShell>
  );
}
