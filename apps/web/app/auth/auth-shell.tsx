import type { ReactNode } from 'react';
import Link from 'next/link';

interface AuthShellProps {
  readonly children: ReactNode;
  readonly eyebrow?: string;
}

export function AuthShell({
  children,
  eyebrow = 'Founder-to-founder support',
}: AuthShellProps) {
  return (
    <main className="fc-auth-shell">
      <aside className="fc-auth-brand" aria-label="FounderChatters">
        <Link className="fc-auth-wordmark" href="/">
          FounderChatters
        </Link>
        <div className="fc-auth-brand__content">
          <p className="fc-auth-eyebrow">{eyebrow}</p>
          <p className="fc-auth-quote">
            The right conversation can change what happens next.
          </p>
          <p className="fc-auth-supporting">
            Ask for help. Share what you know. Build alongside founders who
            understand the work.
          </p>
        </div>
        <p className="fc-auth-brand__footer">Built for useful conversations.</p>
      </aside>
      <section className="fc-auth-main">
        <Link className="fc-auth-mobile-wordmark" href="/">
          FounderChatters
        </Link>
        <div className="fc-auth-panel">{children}</div>
      </section>
    </main>
  );
}
