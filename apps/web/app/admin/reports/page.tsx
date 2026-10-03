import { AdminShell } from '@founderchatters/ui';
import type { Metadata } from 'next';

import { ReportsQueueClient } from './reports-queue-client';

export const metadata: Metadata = {
  title: 'Reports · Admin · FounderChatters',
};

export default function AdminReportsPage() {
  return (
    <AdminShell activeItem="Moderation">
      <ReportsQueueClient />
    </AdminShell>
  );
}
