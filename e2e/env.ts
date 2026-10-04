import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

loadEnvironment({
  path: resolve(import.meta.dirname, '../.env'),
  quiet: true,
});

export const E2E_WEB_ORIGIN = 'http://localhost:3100';
export const E2E_API_ORIGIN = 'http://localhost:4100';
export const E2E_DATABASE_NAME = 'founderchatters_e2e';
export const E2E_PASSWORD = 'e2e-correct-horse';
export const E2E_COOKIE_NAME = 'fc_session';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export type E2eProcessEnv = {
  NODE_ENV: 'test';
  DATABASE_URL: string;
  REDIS_URL: string;
  WEB_URL: string;
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_WEB_URL: string;
  ALLOWED_ORIGINS: string;
  SESSION_SECRET: string;
  PASSWORD_PEPPER: string;
  AUTH_TOKEN_SECRET: string;
  SESSION_COOKIE_NAME: string;
  EMAIL_PROVIDER: 'memory';
  PORT: string;
};

export function e2eEnv(): E2eProcessEnv {
  const postgresPort = process.env.POSTGRES_PORT?.trim() || '5432';
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.E2E_DATABASE_URL?.trim() ||
      `postgresql://founderchatters:founderchatters@127.0.0.1:${postgresPort}/${E2E_DATABASE_NAME}`,
    REDIS_URL: process.env.E2E_REDIS_URL?.trim() || 'redis://127.0.0.1:6379/2',
    WEB_URL: E2E_WEB_ORIGIN,
    NEXT_PUBLIC_API_URL: E2E_API_ORIGIN,
    NEXT_PUBLIC_WEB_URL: E2E_WEB_ORIGIN,
    ALLOWED_ORIGINS: E2E_WEB_ORIGIN,
    SESSION_SECRET: 'e2e-session-secret-fc021-local',
    PASSWORD_PEPPER: 'e2e-password-pepper-fc021-local',
    AUTH_TOKEN_SECRET: 'e2e-auth-token-secret-fc021-local',
    SESSION_COOKIE_NAME: E2E_COOKIE_NAME,
    EMAIL_PROVIDER: 'memory',
    PORT: '4100',
  };
}

export function applyE2eEnv(): E2eProcessEnv {
  const env = e2eEnv();
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return env;
}

export function isAcceptedLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOCAL_HOSTS.has(host);
}

export function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return (
    decodeURIComponent(url.pathname.replace(/^\//, '')).split('/')[0] ?? ''
  );
}

export function adminDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}
