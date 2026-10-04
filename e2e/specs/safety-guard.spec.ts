import { expect, test } from '../fixtures/playwright.js';

import { e2eEnv } from '../env.js';
import { assertE2eSafety, E2eSafetyError } from '../helpers/safety.js';

test.describe('E2E safety guard', () => {
  test('accepts the isolated local test environment', () => {
    expect(() => assertE2eSafety(e2eEnv())).not.toThrow();
  });

  test('refuses non-test NODE_ENV', () => {
    expect(() =>
      assertE2eSafety({ ...e2eEnv(), NODE_ENV: 'production' }),
    ).toThrow(E2eSafetyError);
  });

  test('refuses a remote database host even when NODE_ENV is test', () => {
    expect(() =>
      assertE2eSafety({
        ...e2eEnv(),
        DATABASE_URL:
          'postgresql://founderchatters:founderchatters@db.example.com:5432/founderchatters_e2e',
      }),
    ).toThrow(/not local/);
  });

  test('refuses a production-like database name on localhost', () => {
    expect(() =>
      assertE2eSafety({
        ...e2eEnv(),
        DATABASE_URL:
          'postgresql://founderchatters:founderchatters@127.0.0.1:5432/founderchatters',
      }),
    ).toThrow(/identify e2e or test/);
  });

  test('refuses a remote Redis host', () => {
    expect(() =>
      assertE2eSafety({
        ...e2eEnv(),
        REDIS_URL: 'redis://redis.example.com:6379/2',
      }),
    ).toThrow(/REDIS_URL host/);
  });
});
