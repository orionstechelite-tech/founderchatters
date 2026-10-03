import type { Metadata } from 'next';

import { MemberAppShell } from '../member/member-app-shell';
import { NotificationsGate } from './notifications-gate';

export const metadata: Metadata = {
  title: 'Notifications · FounderChatters',
};

export default function NotificationsPage() {
  return (
    <MemberAppShell activeItem="Home">
      <NotificationsGate />
    </MemberAppShell>
  );
}
