import { defineConfig, devices } from '@playwright/test';

import { applyE2eEnv, E2E_API_ORIGIN, E2E_WEB_ORIGIN } from './e2e/env.js';

const env = applyE2eEnv();

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: E2E_WEB_ORIGIN,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  webServer: [
    {
      command: 'npx tsx src/main.ts',
      cwd: 'apps/api',
      url: `${E2E_API_ORIGIN}/v1`,
      reuseExistingServer: false,
      timeout: 120_000,
      env,
    },
    {
      command: 'node ./e2e/start-web.mjs',
      cwd: '.',
      url: E2E_WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        ...env,
        PORT: '3100',
        NODE_ENV: 'production',
        E2E_WEB_BUILD: '1',
      },
    },
  ],
});
