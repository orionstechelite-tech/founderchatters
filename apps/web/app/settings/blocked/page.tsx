import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';

export const metadata: Metadata = {
  title: 'Blocked users · FounderChatters',
};

export default function BlockedSettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <header className="fc-settings-section-header">
          <p className="fc-label">Blocked users</p>
          <h2>Blocked users</h2>
          <p>
            Blocking and reporting controls are handled by the upcoming member
            safety workflow.
          </p>
        </header>

        <div className="fc-settings-empty-card">
          <p className="fc-label">Member safety</p>
          <h3>Block management is not available here yet.</h3>
          <p>
            FC-016 does not expose or mutate block records. This avoids
            presenting controls that are not backed by the complete safety and
            moderation workflow.
          </p>
        </div>
      </SettingsFrame>
    </MemberAppShell>
  );
}
