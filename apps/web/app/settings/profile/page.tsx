import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';
import { ProfileSettingsClient } from './profile-settings-client';

export const metadata: Metadata = {
  title: 'Profile settings · FounderChatters',
};

export default function ProfileSettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <ProfileSettingsClient />
      </SettingsFrame>
    </MemberAppShell>
  );
}
