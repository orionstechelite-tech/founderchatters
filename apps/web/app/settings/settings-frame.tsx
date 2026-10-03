'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const settingsItems = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/blocked', label: 'Blocked users' },
  { href: '/settings/security', label: 'Security' },
] as const;

export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="fc-settings">
      <header className="fc-settings-hero">
        <p className="fc-settings-mobile-title">Settings</p>
        <p className="fc-label fc-settings-desktop-kicker">Settings</p>
        <h1 className="fc-settings-desktop-title">Account &amp; preferences</h1>
      </header>

      <div className="fc-settings-layout">
        <nav aria-label="Settings navigation" className="fc-settings-nav">
          {settingsItems.map((item) => (
            <Link
              aria-current={pathname === item.href ? 'page' : undefined}
              className="fc-settings-nav__item"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <section className="fc-settings-panel">{children}</section>
      </div>
    </div>
  );
}
