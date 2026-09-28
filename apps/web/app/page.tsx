import { getWorkspaceStatus } from '@/lib/workspace-status';

export default function HomePage() {
  return (
    <main>
      <h1>FounderChatters</h1>
      <p>{getWorkspaceStatus()}</p>
    </main>
  );
}
