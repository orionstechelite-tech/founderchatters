import { AdminShell } from '@founderchatters/ui';
import type { Metadata } from 'next';

import { ReportDetailClient } from './report-detail-client';

export const metadata: Metadata = {
  title: 'Report detail · Admin · FounderChatters',
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell activeItem="Moderation">
      <ReportDetailClient reportId={id} />
    </AdminShell>
  );
}
