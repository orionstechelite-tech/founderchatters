import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';
import { SecuritySettingsClient } from './security-settings-client';

export const metadata: Metadata = {
  title: 'Security settings · FounderChatters',
};

export default function SecuritySettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <SecuritySettingsClient />
      </SettingsFrame>
    </MemberAppShell>
  );
}
