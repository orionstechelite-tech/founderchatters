import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { applyE2eEnv, e2eEnv } from './env.js';
import {
  applyCommittedMigrations,
  disconnectPrisma,
  ensureIsolatedE2eDatabase,
  resetE2eMutableState,
  seedCatalog,
} from './helpers/db.js';
import { assertE2eSafety } from './helpers/safety.js';

const ROOT = resolve(import.meta.dirname, '..');

export default async function globalSetup(): Promise<void> {
  applyE2eEnv();
  assertE2eSafety();
  execFileSync('npx', ['prisma', 'generate'], {
    cwd: ROOT,
    env: { ...process.env, ...e2eEnv() },
    stdio: 'inherit',
    shell: true,
  });
  execFileSync(
    'npm',
    ['run', 'build', '--workspace', '@founderchatters/contracts'],
    {
      cwd: ROOT,
      env: { ...process.env, ...e2eEnv() },
      stdio: 'inherit',
      shell: true,
    },
  );
  await ensureIsolatedE2eDatabase();
  applyCommittedMigrations();
  seedCatalog();
  await resetE2eMutableState();
  await disconnectPrisma();
}
