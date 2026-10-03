import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { AnalyticsScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Analytics · Admin · FounderChatters',
};

export default function AdminAnalyticsPage() {
  return (
    <AdminAppShell
      activeItem="Analytics"
      required={ADMIN_PERMISSIONS.analyticsRead}
    >
      <AnalyticsScreen />
    </AdminAppShell>
  );
}
