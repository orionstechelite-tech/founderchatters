import type { ReactNode } from 'react';

import { MemberTopNavigation } from './member';

const compactMemberItems = [
  { href: '#home', label: 'Home' },
  { href: '#discover', label: 'Discover' },
  { href: '#ask', label: 'Ask' },
  { href: '#messages', label: 'Messages' },
  { href: '#profile', label: 'Profile' },
];
export interface ShellProps {
  children: ReactNode;
}

export function MemberShell({ children }: ShellProps) {
  return (
    <div className="fc-member-shell">
      <MemberTopNavigation
        activeItem="Home"
        items={compactMemberItems}
        logo={
          <>
            <span className="fc-member-wordmark-full">FounderChatters</span>
            <span className="fc-member-wordmark-short">FC</span>
          </>
        }
        actions={
          <button
            aria-label="Open member menu"
            className="fc-member-menu"
            type="button"
          >
            •••
          </button>
        }
      />
      <main className="fc-member-shell__content">{children}</main>
    </div>
  );
}

export function MarketingHeader() {
  return (
    <header className="fc-marketing-header">
      <div className="fc-public-container fc-marketing-header__inner">
        <a aria-label="FounderChatters home" className="fc-wordmark" href="/">
          FounderChatters
        </a>
        <nav
          aria-label="Public navigation"
          className="fc-marketing-header__nav"
        >
          <a href="#about">About</a>
          <a href="#how">How it works</a>
          <a href="#stories">Founder stories</a>
        </nav>
        <a className="fc-header-cta" href="#join">
          Join the network
        </a>
        <button
          aria-expanded="false"
          aria-label="Open navigation menu"
          className="fc-mobile-menu"
          type="button"
        >
          Menu
        </button>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="fc-marketing-footer">
      <div className="fc-public-container fc-marketing-footer__inner">
        <div>
          <div className="fc-wordmark fc-wordmark--inverse">
            FounderChatters
          </div>
          <p>Founders helping founders, one useful conversation at a time.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#about">About</a>
          <a href="#support">Support</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </nav>
        <small>© FounderChatters</small>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: ShellProps) {
  return (
    <div className="fc-marketing-shell">
      <MarketingHeader />
      <main className="fc-public-container fc-marketing-shell__content">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

const adminItems = [
  'Command center',
  'Applications',
  'Members',
  'Moderation',
  'Taxonomy',
  'Operations',
];
export function AdminShell({ children }: ShellProps) {
  return (
    <div className="fc-admin-shell">
      <aside className="fc-admin-sidebar">
        <div className="fc-wordmark fc-wordmark--inverse">FounderChatters</div>
        <div className="fc-admin-sidebar__eyebrow">Admin operations</div>
        <nav aria-label="Admin navigation">
          {adminItems.map((item, index) => (
            <a
              aria-current={index === 0 ? 'page' : undefined}
              href={`#${item.toLowerCase().replace(' ', '-')}`}
              key={item}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <main className="fc-admin-content">{children}</main>
      <section
        aria-labelledby="admin-small-screen-title"
        className="fc-admin-unsupported"
      >
        <div className="fc-admin-unsupported__mark">FC</div>
        <h1 id="admin-small-screen-title">Admin is built for larger screens</h1>
        <p>
          Open FounderChatters Admin on a desktop or tablet with a wider
          display.
        </p>
      </section>
    </div>
  );
}
