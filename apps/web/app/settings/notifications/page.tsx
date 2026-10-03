import type { Metadata } from 'next';
import Link from 'next/link';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';

export const metadata: Metadata = {
  title: 'Notification settings · FounderChatters',
};

export default function NotificationSettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <header className="fc-settings-section-header">
          <p className="fc-label">Notifications</p>
          <h2>Notification activity</h2>
          <p>FounderChatters surfaces activity that needs your attention.</p>
        </header>

        <div className="fc-settings-card">
          <p className="fc-label">Current behavior</p>
          <h3>Important member activity</h3>
          <p>
            Request responses, private-help activity, introductions, messages,
            contribution confirmations, and application updates may appear in
            your notification center.
          </p>
          <p>
            Per-user email, push, and channel preferences are not currently
            configurable.
          </p>
          <Link className="fc-settings-text-link" href="/notifications">
            Open notifications →
          </Link>
        </div>
      </SettingsFrame>
    </MemberAppShell>
  );
}
