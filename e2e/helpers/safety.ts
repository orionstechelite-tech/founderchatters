import { databaseNameFromUrl, e2eEnv, isAcceptedLocalHost } from '../env.js';

export class E2eSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2eSafetyError';
  }
}

export type E2eSafetyInput = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
};

export function assertE2eSafety(input: E2eSafetyInput = e2eEnv()): void {
  if (input.NODE_ENV !== 'test') {
    throw new E2eSafetyError(
      'Refusing E2E destructive setup: NODE_ENV must be test.',
    );
  }
  if (!input.DATABASE_URL) {
    throw new E2eSafetyError(
      'Refusing E2E destructive setup: DATABASE_URL is required.',
    );
  }
  if (!input.REDIS_URL) {
    throw new E2eSafetyError(
      'Refusing E2E destructive setup: REDIS_URL is required.',
    );
  }

  let database: URL;
  let redis: URL;
  try {
    database = new URL(input.DATABASE_URL);
  } catch {
    throw new E2eSafetyError(
      'Refusing E2E destructive setup: DATABASE_URL is not a valid URL.',
    );
  }
  try {
    redis = new URL(input.REDIS_URL);
  } catch {
    throw new E2eSafetyError(
      'Refusing E2E destructive setup: REDIS_URL is not a valid URL.',
    );
  }

  if (!isAcceptedLocalHost(database.hostname)) {
    throw new E2eSafetyError(
      `Refusing E2E destructive setup: DATABASE_URL host ${database.hostname} is not local.`,
    );
  }
  if (!isAcceptedLocalHost(redis.hostname)) {
    throw new E2eSafetyError(
      `Refusing E2E destructive setup: REDIS_URL host ${redis.hostname} is not local.`,
    );
  }

  const databaseName = databaseNameFromUrl(input.DATABASE_URL);
  if (!/(^|[_-])(e2e|test)([_-]|$)/i.test(databaseName)) {
    throw new E2eSafetyError(
      `Refusing E2E destructive setup: database name "${databaseName}" must identify e2e or test use.`,
    );
  }
}
