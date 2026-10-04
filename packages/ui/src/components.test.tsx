// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdminShell,
  Button,
  Field,
  MarketingShell,
  MemberShell,
  RequestCard,
} from './index';

afterEach(cleanup);

describe('design-system controls', () => {
  it('keeps button behavior keyboard accessible and disabled semantics native', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <Button disabled onClick={onClick}>
        Continue
      </Button>,
    );
    expect(button).toBeDisabled();
  });

  it('associates labels, hints, errors, and disabled state', () => {
    const { rerender } = render(
      <Field hint="Use your work email" label="Email" name="email" />,
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Use your work email',
    );
    rerender(<Field error="Enter a valid email" label="Email" name="email" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email',
    );
    rerender(<Field fieldType="textarea" label="Context" state="disabled" />);
    expect(screen.getByLabelText('Context')).toBeDisabled();
  });
});

describe('foundation components', () => {
  it.each([
    [
      'member',
      <MemberShell>
        <h1>Member shell</h1>
      </MemberShell>,
    ],
    [
      'marketing',
      <MarketingShell>
        <h1>Marketing shell</h1>
      </MarketingShell>,
    ],
    [
      'admin',
      <AdminShell>
        <h1>Admin shell</h1>
      </AdminShell>,
    ],
  ])(
    '%s shell has no automated accessibility violations',
    async (_name, component) => {
      const { container } = render(component);
      expect(
        (
          await axe.run(container, {
            rules: { 'color-contrast': { enabled: false } },
          })
        ).violations,
      ).toEqual([]);
    },
  );

  it('keeps primary actions out of content-only request cards', () => {
    render(
      <RequestCard>
        <h2>Looking for onboarding advice</h2>
        <p>Fintech · Early stage</p>
      </RequestCard>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('exposes real public marketing routes instead of placeholder anchors', () => {
    render(
      <MarketingShell>
        <h1>Marketing shell</h1>
      </MarketingShell>,
    );
    expect(
      screen.getByRole('navigation', { name: 'Public navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'How it works' })[0],
    ).toHaveAttribute('href', '/how-it-works');
    expect(
      screen.getAllByRole('link', { name: 'Join FounderChatters' })[0],
    ).toHaveAttribute('href', '/signup');
    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('a[href="#about"]')).toBeNull();
    expect(document.querySelector('a[href="#stories"]')).toBeNull();
  });

  it('uses the frozen five-destination member navigation contract', () => {
    render(
      <MemberShell>
        <h1>Member shell</h1>
      </MemberShell>,
    );
    const navigation = screen.getByRole('navigation', {
      name: 'Member navigation',
    });
    expect(
      Array.from(navigation.querySelectorAll('a'), (link) => link.textContent),
    ).toEqual(['Home', 'Discover', 'Ask', 'Messages', 'Profile']);
  });
});
