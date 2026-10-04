import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import {
  adminDatabaseUrl,
  applyE2eEnv,
  databaseNameFromUrl,
  e2eEnv,
} from '../env.js';
import { assertE2eSafety } from './safety.js';

const ROOT = resolve(import.meta.dirname, '../..');

type PgClient = {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end: () => Promise<void>;
};

let client: PgClient | undefined;

export function newId(prefix = 'e2e'): string {
  return `${prefix}${randomBytes(12).toString('hex')}`;
}

export async function getPg(): Promise<PgClient> {
  if (client) return client;
  applyE2eEnv();
  assertE2eSafety();
  const { default: pg } = await import('pg');
  const next = new pg.Client({ connectionString: e2eEnv().DATABASE_URL });
  await next.connect();
  client = next;
  return next;
}

export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.end();
  client = undefined;
}

export async function ensureIsolatedE2eDatabase(): Promise<void> {
  applyE2eEnv();
  assertE2eSafety();
  const { default: pg } = await import('pg');
  const env = e2eEnv();
  const databaseName = databaseNameFromUrl(env.DATABASE_URL);
  const admin = new pg.Client({
    connectionString: adminDatabaseUrl(env.DATABASE_URL),
  });
  await admin.connect();
  try {
    const existing = await admin.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }
}

export function applyCommittedMigrations(): void {
  applyE2eEnv();
  assertE2eSafety();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, ...e2eEnv() },
    stdio: 'inherit',
    shell: true,
  });
}

export function seedCatalog(): void {
  applyE2eEnv();
  assertE2eSafety();
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    cwd: ROOT,
    env: { ...process.env, ...e2eEnv() },
    stdio: 'inherit',
    shell: true,
  });
  execFileSync('npx', ['tsx', 'scripts/sync-admin-rbac-catalog.ts'], {
    cwd: ROOT,
    env: { ...process.env, ...e2eEnv() },
    stdio: 'inherit',
    shell: true,
  });
}

export async function resetE2eMutableState(): Promise<void> {
  assertE2eSafety();
  const pg = await getPg();
  await pg.query(`
    TRUNCATE TABLE
      "User",
      "AuditLog",
      "SupportCase",
      "JobFailure",
      "PlatformSetting"
    CASCADE
  `);
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const pg = await getPg();
  const result = await pg.query(text, values);
  return result.rows as T[];
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T> {
  const rows = await query<T>(text, values);
  const row = rows[0];
  if (!row) {
    throw new Error(`E2E query returned no rows: ${text}`);
  }
  return row;
}
