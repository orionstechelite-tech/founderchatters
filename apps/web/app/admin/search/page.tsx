import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { SearchScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Search · Admin · FounderChatters',
};

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <AdminAppShell
      activeItem="Overview"
      required={ADMIN_PERMISSIONS.searchRead}
    >
      <SearchScreen initialQuery={q ?? ''} />
    </AdminAppShell>
  );
}
