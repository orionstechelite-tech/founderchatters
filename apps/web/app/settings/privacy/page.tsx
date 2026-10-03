import type { Metadata } from 'next';
import Link from 'next/link';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';

export const metadata: Metadata = {
  title: 'Privacy settings · FounderChatters',
};

export default function PrivacySettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <header className="fc-settings-section-header fc-settings-privacy-header">
          <p className="fc-label">Privacy</p>
          <h2>Privacy &amp; Security</h2>
          <p>
            Understand who can reach you and how your member information is used
            inside the founder network.
          </p>
        </header>

        <div className="fc-settings-policy-grid">
          <article className="fc-settings-policy-card">
            <p className="fc-label">Direct messages</p>
            <h3>Who can message you</h3>
            <p>Founders connected to a request.</p>
          </article>

          <article className="fc-settings-policy-card">
            <p className="fc-label">Profile visibility</p>
            <h3>Founder network</h3>
            <p>
              Your founder profile is visible to eligible members. Your private
              conversations are not globally browseable.
            </p>
          </article>

          <article className="fc-settings-card fc-settings-security-summary">
            <p className="fc-label">Security</p>
            <h3>Password &amp; sessions</h3>
            <Link href="/settings/security">Change password →</Link>
            <Link href="/settings/security">Active sessions →</Link>
          </article>
        </div>

        <aside className="fc-settings-note">
          These are current platform rules rather than per-user privacy toggles,
          so there is no fake “save privacy settings” action.
        </aside>
      </SettingsFrame>
    </MemberAppShell>
  );
}
