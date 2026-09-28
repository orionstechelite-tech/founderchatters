import type { ReactNode } from 'react';

import { cx } from './utils';

export interface NavItemProps {
  active?: boolean;
  href: string;
  icon?: ReactNode;
  label: string;
}

export function MemberNavItem({
  active = false,
  href,
  icon,
  label,
}: NavItemProps) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className="fc-member-nav-item"
      data-nav-item={label.toLowerCase()}
      href={href}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </a>
  );
}

export function MobileBottomNavItem({
  active = false,
  href,
  icon,
  label,
}: NavItemProps) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className="fc-mobile-nav-item"
      href={href}
    >
      <span aria-hidden="true" className="fc-mobile-nav-item__icon">
        {icon}
      </span>
      <span>{label}</span>
    </a>
  );
}

interface CardProps {
  className?: string;
  children: ReactNode;
}
export function RequestCard({ children, className }: CardProps) {
  return (
    <article className={cx('fc-card fc-request-card', className)}>
      {children}
    </article>
  );
}
export function FounderCard({ children, className }: CardProps) {
  return (
    <article className={cx('fc-card fc-founder-card', className)}>
      {children}
    </article>
  );
}
export function RequestContext({ children, className }: CardProps) {
  return (
    <aside className={cx('fc-request-context', className)}>{children}</aside>
  );
}
export function ContributionCard({ children, className }: CardProps) {
  return (
    <article className={cx('fc-card fc-contribution-card', className)}>
      {children}
    </article>
  );
}

export interface MemberTopNavigationProps {
  actions?: ReactNode;
  activeItem?: string;
  className?: string;
  items: Array<{ href: string; label: string }>;
  logo?: ReactNode;
}

export interface MemberTwoColumnProps {
  aside: ReactNode;
  children: ReactNode;
}

export function MemberTwoColumn({ aside, children }: MemberTwoColumnProps) {
  return (
    <div className="fc-member-two-column">
      <div className="fc-member-two-column__main">{children}</div>
      <aside className="fc-member-two-column__aside">{aside}</aside>
    </div>
  );
}

export function MemberTopNavigation({
  actions,
  activeItem,
  className,
  items,
  logo,
}: MemberTopNavigationProps) {
  return (
    <header className={cx('fc-member-topbar', className)}>
      <div className="fc-member-topbar__inner">
        <a aria-label="FounderChatters home" className="fc-wordmark" href="/">
          {logo ?? 'FounderChatters'}
        </a>
        <nav aria-label="Member navigation" className="fc-member-topbar__nav">
          {items.map((item) => (
            <MemberNavItem
              active={activeItem === item.label}
              key={item.href}
              {...item}
            />
          ))}
        </nav>
        <div className="fc-member-topbar__actions">{actions}</div>
      </div>
    </header>
  );
}
