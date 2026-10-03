import type { Metadata } from 'next';

import { MemberAppShell } from '../../member/member-app-shell';
import { SettingsFrame } from '../settings-frame';
import { BlockedSettingsClient } from './blocked-settings-client';

export const metadata: Metadata = {
  title: 'Blocked users · FounderChatters',
};

export default function BlockedSettingsPage() {
  return (
    <MemberAppShell activeItem="Profile">
      <SettingsFrame>
        <BlockedSettingsClient />
      </SettingsFrame>
    </MemberAppShell>
  );
}
