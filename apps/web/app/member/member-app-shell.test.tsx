// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => navigation,
}));

import {
  hasMemberSessionJobForTests,
  MemberAppShell,
  resetMemberSessionJobForTests,
} from './member-app-shell';

afterEach(() => {
  cleanup();
  resetMemberSessionJobForTests();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const activeSession = {
  user: {
    id: 'user-active',
    email: 'active@example.com',
    emailVerified: true,
    status: 'ACTIVE',
  },
  access: {
    state: 'ACTIVE',
    applicationStatus: 'APPROVED',
    onboardingCompleted: true,
  },
};

const onboardingSession = {
  ...activeSession,
  access: {
    state: 'ONBOARDING',
    applicationStatus: 'APPROVED',
    onboardingCompleted: false,
  },
};

function renderShell() {
  return render(
    <MemberAppShell activeItem="Home">
      <p>workspace child</p>
    </MemberAppShell>,
  );
}

describe('MemberAppShell session in-flight job', () => {
  it('shares one in-flight session request across remounts', async () => {
    let resolveSession: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = renderShell();
    expect(screen.getByText('Loading your workspace…')).toBeVisible();
    first.unmount();

    renderShell();
    expect(screen.getByText('Loading your workspace…')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasMemberSessionJobForTests()).toBe(true);

    resolveSession?.(response(activeSession));
    expect(await screen.findByText('workspace child')).toBeVisible();
    expect(hasMemberSessionJobForTests()).toBe(false);
  });

  it('loads a fresh session after the in-flight job settles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(activeSession))
      .mockResolvedValueOnce(response(onboardingSession));
    vi.stubGlobal('fetch', fetchMock);

    const first = renderShell();
    expect(await screen.findByText('workspace child')).toBeVisible();
    expect(hasMemberSessionJobForTests()).toBe(false);
    first.unmount();

    renderShell();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/onboarding'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hasMemberSessionJobForTests()).toBe(false);
  });
});
