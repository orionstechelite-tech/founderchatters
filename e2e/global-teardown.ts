import { disconnectPrisma } from './helpers/db.js';
import { assertE2eSafety } from './helpers/safety.js';
import { applyE2eEnv } from './env.js';

export default async function globalTeardown(): Promise<void> {
  applyE2eEnv();
  assertE2eSafety();
  await disconnectPrisma();
}
