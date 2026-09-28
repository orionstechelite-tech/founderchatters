import { AdminShell } from '@founderchatters/ui';
import type { Metadata } from 'next';

import { ApplicationDetailClient } from './application-detail-client';

export const metadata: Metadata = {
  title: 'Application review · Admin · FounderChatters',
};

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell activeItem="Applications">
      <ApplicationDetailClient id={id} />
    </AdminShell>
  );
}
