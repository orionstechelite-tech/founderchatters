import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../../admin-app-shell';
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
    <AdminAppShell
      activeItem="Reports"
      required={ADMIN_PERMISSIONS.reportsRead}
    >
      <ReportDetailClient reportId={id} />
    </AdminAppShell>
  );
}
