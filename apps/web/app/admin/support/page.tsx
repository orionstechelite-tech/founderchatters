import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { SupportScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Support · Admin · FounderChatters',
};

export default function AdminSupportPage() {
  return (
    <AdminAppShell
      activeItem="Support & Appeals"
      required={ADMIN_PERMISSIONS.supportRead}
    >
      <SupportScreen />
    </AdminAppShell>
  );
}
