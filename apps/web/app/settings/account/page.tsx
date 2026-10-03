import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';
import { AccountSettingsClient } from './account-settings-client';

export const metadata: Metadata = {
  title: 'Account settings · FounderChatters',
};

export default function AccountSettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <AccountSettingsClient />
      </SettingsFrame>
    </MemberAppShell>
  );
}
