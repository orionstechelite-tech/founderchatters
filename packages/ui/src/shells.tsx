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

export function MemberShell({
  actions,
  activeItem = 'Home',
  children,
  items = compactMemberItems,
}: ShellProps & {
  actions?: ReactNode;
  activeItem?: string;
  items?: Array<{ disabled?: boolean; href: string; label: string }>;
}) {
  return (
    <div className="fc-member-shell">
      <MemberTopNavigation
        activeItem={activeItem}
        items={items}
        logo={
          <>
            <span className="fc-member-wordmark-full">FounderChatters</span>
            <span className="fc-member-wordmark-short">FC</span>
          </>
        }
        actions={
          actions ?? (
            <button
              aria-label="Open member menu"
              className="fc-member-menu"
              type="button"
            >
              •••
            </button>
          )
        }
      />
      <main className="fc-member-shell__content">{children}</main>
    </div>
  );
}

const marketingHeaderLinks = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/for-founders', label: 'For founders' },
  { href: '/guidelines', label: 'Guidelines' },
  { href: '/signin', label: 'Sign in' },
] as const;

const marketingFooterLinks = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/for-founders', label: 'For founders' },
  { href: '/guidelines', label: 'Guidelines' },
  { href: '/support', label: 'Support' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/signin', label: 'Sign in' },
  { href: '/signup', label: 'Join' },
] as const;

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
          {marketingHeaderLinks.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="fc-header-cta" href="/signup">
          Join FounderChatters
        </a>
        <details className="fc-marketing-menu">
          <summary>Menu</summary>
          <nav aria-label="Public menu">
            {marketingHeaderLinks.map((item) => (
              <a href={item.href} key={`menu-${item.href}`}>
                {item.label}
              </a>
            ))}
            <a href="/signup">Join FounderChatters</a>
          </nav>
        </details>
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
          <p>
            Founder-to-founder support built around useful asks and real help.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          {marketingFooterLinks.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <small>FounderChatters · Public website</small>
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

export const ADMIN_NAV_GROUPS = [
  {
    label: 'OPERATIONS',
    items: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/applications', label: 'Applications' },
      { href: '/admin/members', label: 'Members' },
      { href: '/admin/requests', label: 'Requests' },
      { href: '/admin/support', label: 'Support & Appeals' },
    ],
  },
  {
    label: 'TRUST & QUALITY',
    items: [
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/reputation', label: 'Reputation' },
      { href: '/admin/notifications', label: 'Notifications' },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { href: '/admin/taxonomy', label: 'Taxonomy' },
      { href: '/admin/analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      { href: '/admin/admins', label: 'Admins & Roles' },
      { href: '/admin/audit', label: 'Audit Log' },
      { href: '/admin/settings', label: 'Platform Settings' },
      { href: '/admin/system', label: 'System Health' },
    ],
  },
] as const;

export type AdminNavLabel =
  (typeof ADMIN_NAV_GROUPS)[number]['items'][number]['label'];

export type AdminNavGroup = {
  label: string;
  items: ReadonlyArray<{ href: string; label: string }>;
};

export function AdminShell({
  activeItem = 'Overview',
  children,
  groups = ADMIN_NAV_GROUPS,
  signedInAs,
}: ShellProps & {
  activeItem?: string;
  groups?: readonly AdminNavGroup[];
  signedInAs?: string;
}) {
  return (
    <div className="fc-admin-shell">
      <aside className="fc-admin-sidebar">
        <div className="fc-wordmark fc-wordmark--inverse">FounderChatters</div>
        <div className="fc-admin-sidebar__eyebrow">Admin operations</div>
        <nav aria-label="Admin navigation">
          {groups.map((group) => (
            <div className="fc-admin-nav-group" key={group.label}>
              <p className="fc-admin-nav-group__label">{group.label}</p>
              {group.items.map((item) => (
                <a
                  aria-current={item.label === activeItem ? 'page' : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <form action="/admin/search" className="fc-admin-search" method="get">
          <label
            className="fc-admin-search__label"
            htmlFor="admin-global-search"
          >
            Search
          </label>
          <input
            id="admin-global-search"
            minLength={2}
            name="q"
            placeholder="Search founder, email, company, request or report ID"
            type="search"
          />
        </form>
        {signedInAs ? (
          <p className="fc-admin-signed-in">Signed in as {signedInAs}</p>
        ) : null}
      </aside>
      <main className="fc-admin-content">{children}</main>
      <section
        aria-labelledby="admin-small-screen-title"
        className="fc-admin-unsupported"
      >
        <p className="fc-admin-unsupported__kicker">FounderChatters Admin</p>
        <div className="fc-admin-unsupported__card">
          <h1 id="admin-small-screen-title">Larger screen required</h1>
          <p>FounderChatters Admin is optimized for desktop operations.</p>
          <p>
            Use a screen around 900px wide or larger to access queues, tables,
            case details, and operational controls safely.
          </p>
          <a
            className="fc-button fc-button--medium fc-button--secondary"
            href="/home"
          >
            Return to member app
          </a>
        </div>
        <p className="fc-admin-unsupported__policy">
          MVP policy · Admin mobile UI is intentionally not designed. 1440
          canonical + 1024 supported.
        </p>
      </section>
    </div>
  );
}
