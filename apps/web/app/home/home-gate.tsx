'use client';

import { MemberAppShell } from '../member/member-app-shell';

export function HomeGate() {
  return (
    <MemberAppShell activeItem="Home">
      <section className="fc-discover-hero">
        <div>
          <p className="fc-label">Home</p>
          <h1>You’re in the network.</h1>
          <p>
            Discover founders you can actually learn from. Requests and messages
            will arrive in later tasks.
          </p>
        </div>
      </section>
    </MemberAppShell>
  );
}
