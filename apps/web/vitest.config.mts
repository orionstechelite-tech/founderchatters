import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    // axe + multi-step userEvent onboarding coverage exceeds Vitest's 5s default.
    testTimeout: 15_000,
  },
});
