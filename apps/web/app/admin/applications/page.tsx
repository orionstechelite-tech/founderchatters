import { AdminShell } from '@founderchatters/ui';
import type { Metadata } from 'next';

import { ApplicationsQueueClient } from './applications-queue-client';

export const metadata: Metadata = {
  title: 'Applications · Admin · FounderChatters',
};

export default function AdminApplicationsPage() {
  return (
    <AdminShell activeItem="Applications">
      <ApplicationsQueueClient />
    </AdminShell>
  );
}
