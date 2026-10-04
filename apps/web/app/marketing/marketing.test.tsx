// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ForFoundersPage from '../for-founders/page';
import GuidelinesPage from '../guidelines/page';
import HowItWorksPage from '../how-it-works/page';
import HomePage from '../page';
import PrivacyPage from '../privacy/page';
import SupportPage from '../support/page';
import TermsPage from '../terms/page';

afterEach(cleanup);

function hrefsNamed(name: string): string[] {
  return screen
    .getAllByRole('link', { name })
    .map((link) => link.getAttribute('href') ?? '');
}

describe('public marketing pages', () => {
  it('renders the homepage contract without fabricated traction', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Build companies. Not alone.',
      }),
    ).toBeInTheDocument();
    expect(hrefsNamed('Join FounderChatters')).toContain('/signup');
    expect(hrefsNamed('How it works')).toContain('/how-it-works');
    expect(hrefsNamed('For founders')).toContain('/for-founders');
    expect(hrefsNamed('Guidelines')).toContain('/guidelines');
    expect(hrefsNamed('Support')).toContain('/support');
    expect(hrefsNamed('Privacy')).toContain('/privacy');
    expect(hrefsNamed('Terms')).toContain('/terms');
    expect(hrefsNamed('Sign in')).toContain('/signin');
    expect(document.querySelector('a[href="#about"]')).toBeNull();
    expect(document.querySelector('a[href="#stories"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /10,000 founders|30 countries|hundreds of introductions/i,
    );
    expect(screen.getByText('Illustrative request')).toBeInTheDocument();
    expect(
      screen.getByText(/not a real FounderChatters request/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Public navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
  });

  it('explains how useful help becomes contribution', () => {
    render(<HowItWorksPage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Useful founder help, without the noise.',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/no follower count/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/explicit HELPED confirmation creates contribution/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Still talking/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Private messages are not globally browseable/i),
    ).toBeInTheDocument();
  });

  it('covers founder use cases and leaves pricing unpublished', () => {
    render(<ForFoundersPage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The right founder can save you weeks.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('GTM')).toBeInTheDocument();
    expect(screen.getByText('Hiring')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Introductions')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(
      screen.getAllByText(/Ask when you need help. Help when you can./).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('Pricing and access details are not yet published.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /free forever|subscription|trial|\$\d+/,
    );
  });

  it('renders guidelines, privacy, terms, and support categories', () => {
    render(<GuidelinesPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Guidelines' }),
    ).toBeInTheDocument();
    cleanup();
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not globally browseable by Admin/i),
    ).toBeInTheDocument();
    cleanup();
    render(<TermsPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms' }),
    ).toBeInTheDocument();
    cleanup();
    render(<SupportPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Contact support' }),
    ).toBeInTheDocument();
    for (const category of [
      'account',
      'application',
      'safety',
      'privacy',
      'technical',
      'other',
    ]) {
      expect(
        document.querySelector(`a[href="/support/new?category=${category}"]`),
      ).not.toBeNull();
    }
  });
});
