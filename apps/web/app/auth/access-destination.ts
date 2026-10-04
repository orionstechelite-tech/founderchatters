import type { AuthAccessState } from '@founderchatters/contracts';

export function destinationForAccessState(state: AuthAccessState): string {
  switch (state) {
    case 'VERIFY_EMAIL':
      return '/verify-email';
    case 'APPLICATION':
      return '/application';
    case 'ONBOARDING':
      return '/onboarding';
    case 'ACTIVE':
      return '/home';
    case 'SUSPENDED':
      return '/suspended';
  }
}
