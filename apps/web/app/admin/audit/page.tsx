import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { AuditScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Audit log · Admin · FounderChatters',
};

export default function AdminAuditPage() {
  return (
    <AdminAppShell
      activeItem="Audit Log"
      required={ADMIN_PERMISSIONS.auditRead}
    >
      <AuditScreen />
    </AdminAppShell>
  );
}
