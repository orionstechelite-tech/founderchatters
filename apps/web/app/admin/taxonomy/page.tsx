import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Metadata } from 'next';

import { AdminAppShell } from '../admin-app-shell';
import { TaxonomyScreen } from '../admin-screens';

export const metadata: Metadata = {
  title: 'Taxonomy · Admin · FounderChatters',
};

export default function AdminTaxonomyPage() {
  return (
    <AdminAppShell
      activeItem="Taxonomy"
      required={ADMIN_PERMISSIONS.taxonomyRead}
    >
      <TaxonomyScreen />
    </AdminAppShell>
  );
}
