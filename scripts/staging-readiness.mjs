import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';
import { basename, isAbsolute, posix } from 'node:path';

export const APPROVED_PRODUCTION_EMAIL_PROVIDERS = Object.freeze([]);
export const VALIDATION_ENV_BASENAME = '.env.staging.validation';
export const STAGING_BACKUP_CONFIRM =
  'I_UNDERSTAND_THIS_WRITES_A_LOGICAL_DUMP';
export const STAGING_MIGRATE_DEPLOY_CONFIRM =
  'I_UNDERSTAND_THIS_APPLIES_MIGRATIONS';
export const COMPOSE_FILE = 'deploy/staging/docker-compose.yml';
export const CADDYFILE = 'deploy/staging/Caddyfile';
export const STAGING_PROXY_HOP = '172.30.0.10';
export const STAGING_WEB_RUNTIME_NODE_ENV = 'production';
export const STAGING_POSTGRES_SERVICE = 'postgres';
export const STAGING_REDIS_SERVICE = 'redis';
export const SMOKE_REQUEST_TIMEOUT_MS = 10_000;
export const EXPLICIT_ENV_FILE_MESSAGE =
  'An explicit --env-file path is required for live staging operations';

export const STAGING_REQUIRED_KEYS = Object.freeze([
  'NODE_ENV',
  'WEB_URL',
  'API_URL',
  'NEXT_PUBLIC_API_URL',
  'ALLOWED_ORIGINS',
  'TRUST_PROXY_ADDRESSES',
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_COOKIE_NAME',
  'SESSION_SECRET',
  'AUTH_TOKEN_SECRET',
  'PASSWORD_PEPPER',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'STAGING_WEB_HOST',
  'STAGING_API_HOST',
  'STAGING_ACME_EMAIL',
  'STAGING_BACKUP_DIR',
]);

const SECRET_KEYS = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'POSTGRES_PASSWORD',
  'SESSION_SECRET',
  'AUTH_TOKEN_SECRET',
  'PASSWORD_PEPPER',
  'CSRF_SECRET',
  'EMAIL_API_KEY',
  'S3_SECRET_KEY',
  'SENTRY_DSN',
]);

const PLACEHOLDER_PATTERN =
  /replace-me|changeme|change-me|your-secret-here|todo|fixme|placeholder|<.*>/i;
const ACME_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BARE_HOST_PATTERN = /^(?!https?:\/\/)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MUTABLE_IMAGE_TAGS = new Set([
  'local',
  'latest',
  'staging',
  'dev',
  'v1',
]);
const IMAGE_DIGEST_PATTERN = /@sha256:[0-9a-fA-F]{64}$/;
const IMAGE_GIT_SHA_TAG_PATTERN = /:(?:sha-)?[0-9a-f]{40}$/;

export const SMOKE_EXPECTED_STATUSES = Object.freeze({
  '/': 200,
  '/signin': 200,
  '/signup': 200,
  '/support': 200,
  '/v1/health/live': 200,
  '/v1/health/ready': 200,
});

function isBlank(value) {
  return !value || !String(value).trim();
}

function isPlaceholder(value) {
  const normalized = String(value).trim();
  if (isBlank(normalized)) {
    return true;
  }
  if (PLACEHOLDER_PATTERN.test(normalized)) {
    return true;
  }
  return (
    normalized.startsWith('local-') ||
    normalized === 'founderchatters' ||
    normalized === 'memory' ||
    normalized === 'console'
  );
}

function isWeakSecret(value) {
  const normalized = String(value).trim();
  return normalized.length < 32 || isPlaceholder(normalized);
}

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '[::1]'
  );
}

function addFailure(failures, code, message) {
  failures.push({ code, message });
}

function isOverlyBroadTrustedProxy(value) {
  const [address, prefix] = value.split('/');
  return (
    address === '*' ||
    address === '0.0.0.0' ||
    address === '::' ||
    prefix === '0'
  );
}

function isValidIpOrCidr(value) {
  const [address, prefix, extra] = value.split('/');
  const version = address ? isIP(address) : 0;
  if (!version || extra !== undefined) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^\d+$/.test(prefix)) {
    return false;
  }
  const prefixLength = Number(prefix);
  return prefixLength <= (version === 4 ? 32 : 128);
}

export function evaluateTrustedProxyAddresses(value) {
  if (!value?.trim()) {
    return {
      ok: false,
      message:
        'TRUST_PROXY_ADDRESSES is required in staging and production; use "none" when no reverse proxy is present',
    };
  }
  if (value.trim().toLowerCase() === 'none') {
    return { ok: true, addresses: false };
  }
  const addresses = value.split(',').map((address) => address.trim());
  if (addresses.some((address) => !isValidIpOrCidr(address))) {
    return {
      ok: false,
      message:
        'TRUST_PROXY_ADDRESSES must contain only comma-separated IP addresses or CIDRs',
    };
  }
  if (addresses.some((address) => isOverlyBroadTrustedProxy(address))) {
    return {
      ok: false,
      message:
        'TRUST_PROXY_ADDRESSES must not trust every address; list the reverse-proxy hop only',
    };
  }
  return { ok: true, addresses };
}

function isValidationEnvFile(envFile) {
  return basename(envFile ?? '') === VALIDATION_ENV_BASENAME;
}

export function resolvePreflightMode({ envFile, mode } = {}) {
  if (mode === 'validation' && !isValidationEnvFile(envFile)) {
    return 'live';
  }
  if (mode === 'live') {
    return 'live';
  }
  if (mode === 'validation' && isValidationEnvFile(envFile)) {
    return 'validation';
  }
  return isValidationEnvFile(envFile) ? 'validation' : 'live';
}

export function evaluateRequiredExplicitEnvFile(envFileExplicit) {
  if (envFileExplicit) {
    return { ok: true, failures: [] };
  }
  return {
    ok: false,
    failures: [{ code: 'ENV_FILE', message: EXPLICIT_ENV_FILE_MESSAGE }],
  };
}

export function evaluatePreflightExecution({
  envFile,
  mode,
  skipDocker = false,
  envFileExplicit = false,
} = {}) {
  const failures = [];
  if (mode === 'validation' && !isValidationEnvFile(envFile)) {
    addFailure(
      failures,
      'PREFLIGHT_MODE',
      'Validation mode is permitted only for .env.staging.validation',
    );
  }
  const resolved = resolvePreflightMode({ envFile, mode });
  if (resolved === 'live' && !envFileExplicit) {
    addFailure(failures, 'ENV_FILE', EXPLICIT_ENV_FILE_MESSAGE);
  }
  if (skipDocker && resolved !== 'validation') {
    addFailure(
      failures,
      'SKIP_DOCKER',
      'Live staging preflight must validate Compose and Caddy',
    );
  }
  if (skipDocker && mode === 'live') {
    addFailure(
      failures,
      'SKIP_DOCKER',
      'Live staging preflight must validate Compose and Caddy',
    );
  }
  return {
    ok: failures.length === 0,
    mode: resolved,
    skipDocker: skipDocker && resolved === 'validation' && failures.length === 0,
    failures,
  };
}

export function dockerComposeConfigCommand(envFile, composeFile = COMPOSE_FILE) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'config',
      '--quiet',
    ],
  };
}

export function dockerCaddyValidateCommand({
  caddyfile = CADDYFILE,
  webHost,
  apiHost,
  acmeEmail,
}) {
  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-e',
      `STAGING_WEB_HOST=${webHost}`,
      '-e',
      `STAGING_API_HOST=${apiHost}`,
      '-e',
      `STAGING_ACME_EMAIL=${acmeEmail}`,
      '-v',
      `${caddyfile}:/etc/caddy/Caddyfile:ro`,
      'caddy:2-alpine',
      'caddy',
      'validate',
      '--config',
      '/etc/caddy/Caddyfile',
    ],
  };
}

export function dockerComposeOpsCommand({
  envFile,
  composeFile = COMPOSE_FILE,
  serviceArgs,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      '--profile',
      'ops',
      'run',
      '--rm',
      '--no-deps',
      '--pull',
      'never',
      'ops',
      ...serviceArgs,
    ],
  };
}

export function evaluateDockerComposeRunHelpSupportsPull(helpText) {
  return /(?:^|\s)--pull(?:\s|=|$)/m.test(String(helpText ?? ''));
}

export function dockerComposeDataPlaneUpCommand({
  envFile,
  composeFile = COMPOSE_FILE,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'up',
      '-d',
      'postgres',
      'redis',
    ],
  };
}

export function dockerComposeBackupDumpCommand({
  envFile,
  composeFile = COMPOSE_FILE,
  postgresUser,
  postgresDb,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '--username',
      postgresUser,
      '--dbname',
      postgresDb,
      '--format=custom',
    ],
  };
}

export function dockerComposeHumanRecreateDatabaseCommand({
  envFile,
  composeFile = COMPOSE_FILE,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'dropdb --if-exists --username "$POSTGRES_USER" "$POSTGRES_DB" && createdb --username "$POSTGRES_USER" "$POSTGRES_DB"',
    ],
    destructive: true,
    humanOnly: true,
  };
}

export function dockerComposeHumanRestoreIntoCleanDatabaseCommand({
  envFile,
  composeFile = COMPOSE_FILE,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'pg_restore --exit-on-error --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"',
    ],
    destructive: false,
    humanOnly: true,
  };
}

export function dockerComposeBackupListCommand({
  envFile,
  composeFile = COMPOSE_FILE,
}) {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      '-i',
      'postgres',
      'pg_restore',
      '--list',
    ],
  };
}

export function evaluateImmutableImageRef(value, name) {
  if (isBlank(value)) {
    return `${name} is required for live staging`;
  }
  const trimmed = String(value).trim();
  if (/\s/.test(trimmed)) {
    return `${name} must be a single image reference`;
  }
  if (IMAGE_DIGEST_PATTERN.test(trimmed)) {
    return null;
  }
  if (IMAGE_GIT_SHA_TAG_PATTERN.test(trimmed)) {
    return null;
  }
  const digestAt = trimmed.lastIndexOf('@');
  if (digestAt >= 0) {
    return `${name} digest must be sha256:<64 hex characters>`;
  }
  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) {
    return `${name} must include a digest or 40-hex Git SHA tag`;
  }
  const tag = trimmed.slice(separator + 1);
  const normalizedTag = tag.toLowerCase();
  if (MUTABLE_IMAGE_TAGS.has(normalizedTag)) {
    return `${name} must not use a mutable :${normalizedTag} tag`;
  }
  return `${name} must use a digest or 40-hex Git SHA tag`;
}

export function evaluateStagingWebRuntimeNodeEnv(nodeEnv) {
  if (String(nodeEnv ?? '').trim() !== STAGING_WEB_RUNTIME_NODE_ENV) {
    return {
      ok: false,
      message: 'Web runtime NODE_ENV must remain production',
    };
  }
  return { ok: true };
}

export function composeServiceNodeEnv(composeText, serviceName) {
  const lines = String(composeText ?? '').split(/\r?\n/);
  let inService = false;
  let serviceIndent = 0;
  for (const line of lines) {
    const serviceMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      const indent = serviceMatch[1].length;
      const name = serviceMatch[2];
      if (!inService && name === serviceName && indent === 2) {
        inService = true;
        serviceIndent = indent;
        continue;
      }
      if (inService && indent <= serviceIndent && name !== serviceName) {
        break;
      }
    }
    if (inService) {
      const nodeEnv = line.match(/^\s+NODE_ENV:\s*(.+?)\s*$/);
      if (nodeEnv) {
        return nodeEnv[1].replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return '';
}

export const RUNTIME_APPLICATION_SERVICES = Object.freeze([
  'web',
  'api',
  'worker',
  'ops',
]);

export function composeServiceImage(composeText, serviceName) {
  const lines = String(composeText ?? '').split(/\r?\n/);
  let inService = false;
  let serviceIndent = 0;
  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const serviceMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      const indent = serviceMatch[1].length;
      const name = serviceMatch[2];
      if (!inService && name === serviceName && indent === 2) {
        inService = true;
        serviceIndent = indent;
        continue;
      }
      if (inService && indent <= serviceIndent && name !== serviceName) {
        break;
      }
    }
    if (inService) {
      const image = line.match(/^\s+image:\s*(.+?)\s*$/);
      if (image) {
        return image[1].replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return '';
}

export function composeServiceHasBuild(composeText, serviceName) {
  const lines = String(composeText ?? '').split(/\r?\n/);
  let inService = false;
  let serviceIndent = 0;
  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const serviceMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      const indent = serviceMatch[1].length;
      const name = serviceMatch[2];
      if (!inService && name === serviceName && indent === 2) {
        inService = true;
        serviceIndent = indent;
        continue;
      }
      if (inService && indent <= serviceIndent && name !== serviceName) {
        break;
      }
    }
    if (inService && /^\s+build:\s*(?:.*)?$/.test(line)) {
      return true;
    }
  }
  return false;
}

export function evaluateRuntimeComposeHasNoApplicationBuilds(composeText) {
  const servicesWithBuild = RUNTIME_APPLICATION_SERVICES.filter((service) =>
    composeServiceHasBuild(composeText, service),
  );
  return {
    ok: servicesWithBuild.length === 0,
    servicesWithBuild,
  };
}

export function composeServicePublishesPorts(composeText, serviceName) {
  const lines = String(composeText ?? '').split(/\r?\n/);
  let inService = false;
  let serviceIndent = 0;
  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const serviceMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      const indent = serviceMatch[1].length;
      const name = serviceMatch[2];
      if (!inService && name === serviceName && indent === 2) {
        inService = true;
        serviceIndent = indent;
        continue;
      }
      if (inService && indent <= serviceIndent && name !== serviceName) {
        break;
      }
    }
    if (inService && /^\s+ports:\s*$/.test(line)) {
      return true;
    }
  }
  return false;
}

export function evaluateStagingComposeTrustedProxy(value) {
  if (String(value ?? '').trim().toLowerCase() === 'none') {
    return {
      ok: false,
      message:
        'Staging compose always includes Caddy; TRUST_PROXY_ADDRESSES must be 172.30.0.10',
    };
  }
  const generic = evaluateTrustedProxyAddresses(value);
  if (!generic.ok) {
    return generic;
  }
  const addresses = generic.addresses;
  if (
    !Array.isArray(addresses) ||
    addresses.length !== 1 ||
    addresses[0] !== STAGING_PROXY_HOP
  ) {
    return {
      ok: false,
      message:
        'TRUST_PROXY_ADDRESSES must be the staging Caddy hop 172.30.0.10',
    };
  }
  return generic;
}

export function evaluateSmokeStatus(pathname, status) {
  const expected = SMOKE_EXPECTED_STATUSES[pathname];
  if (expected === undefined) {
    return {
      ok: false,
      message: `${pathname} is not part of the automated safe smoke`,
    };
  }
  if (status !== expected) {
    return {
      ok: false,
      message: `${pathname} returned ${status}, expected ${expected}`,
    };
  }
  return { ok: true };
}

function decodeUrlComponent(value) {
  if (value == null || value === '') {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value);
  }
}

function databaseNameFromUrl(url) {
  return decodeUrlComponent(String(url.pathname ?? '').replace(/^\/+/, ''));
}

export function evaluateStagingDataPlaneTargets(env = {}) {
  const failures = [];
  const values = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value == null ? '' : String(value),
    ]),
  );

  const databaseUrl = parseUrl(values.DATABASE_URL);
  if (!values.DATABASE_URL || !databaseUrl) {
    addFailure(
      failures,
      'DATA_PLANE',
      'DATABASE_URL must target the staging postgres Compose service',
    );
  } else {
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL must use a PostgreSQL-compatible protocol',
      );
    }
    if (databaseUrl.hostname !== STAGING_POSTGRES_SERVICE) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL must use hostname postgres',
      );
    }
    if (databaseUrl.port && databaseUrl.port !== '5432') {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL port must be omitted or 5432',
      );
    }
    if (decodeUrlComponent(databaseUrl.username) !== values.POSTGRES_USER) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL username must match POSTGRES_USER',
      );
    }
    if (decodeUrlComponent(databaseUrl.password) !== values.POSTGRES_PASSWORD) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL password must match POSTGRES_PASSWORD',
      );
    }
    if (databaseNameFromUrl(databaseUrl) !== values.POSTGRES_DB) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL database must match POSTGRES_DB',
      );
    }
    if (databaseUrl.search || databaseUrl.hash) {
      addFailure(
        failures,
        'DATA_PLANE',
        'DATABASE_URL must not include query or fragment parameters',
      );
    }
  }

  const redisUrl = parseUrl(values.REDIS_URL);
  if (!values.REDIS_URL || !redisUrl) {
    addFailure(
      failures,
      'DATA_PLANE',
      'REDIS_URL must target the staging redis Compose service',
    );
  } else {
    if (redisUrl.protocol !== 'redis:') {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL must use redis:// for this staging topology',
      );
    }
    if (redisUrl.hostname !== STAGING_REDIS_SERVICE) {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL must use hostname redis',
      );
    }
    if (redisUrl.port && redisUrl.port !== '6379') {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL port must be omitted or 6379',
      );
    }
    if (redisUrl.username || redisUrl.password) {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL must not include credentials for this staging topology',
      );
    }
    const redisPath = redisUrl.pathname || '';
    if (redisPath && redisPath !== '/' && redisPath !== '/0') {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL database path must be empty, /, or /0',
      );
    }
    if (redisUrl.search || redisUrl.hash) {
      addFailure(
        failures,
        'DATA_PLANE',
        'REDIS_URL must not include query or fragment parameters',
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function evaluateStagingOperatorGuards(env = {}, options = {}) {
  const failures = [];
  const explicit = evaluateRequiredExplicitEnvFile(options.envFileExplicit);
  failures.push(...explicit.failures);
  if (env.NODE_ENV && env.NODE_ENV !== 'staging') {
    addFailure(failures, 'NODE_ENV', 'NODE_ENV must be staging');
  }
  if (!env.NODE_ENV) {
    addFailure(failures, 'NODE_ENV', 'NODE_ENV must be staging');
  }
  failures.push(...evaluateStagingDataPlaneTargets(env).failures);
  return {
    ok: failures.length === 0,
    failures,
  };
}

function assertOriginOnly(name, url, failures) {
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    addFailure(
      failures,
      'ORIGIN',
      `${name} must be an origin only, without credentials, path, query, or fragment`,
    );
  }
}

export function evaluateStagingReadiness(env = {}, options = {}) {
  const failures = [];
  const mode = resolvePreflightMode(options);
  const values = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value == null ? '' : String(value),
    ]),
  );

  for (const key of STAGING_REQUIRED_KEYS) {
    if (isBlank(values[key])) {
      addFailure(failures, 'MISSING_ENV', `${key} is required`);
    }
  }

  if (values.NODE_ENV && values.NODE_ENV !== 'staging') {
    addFailure(failures, 'NODE_ENV', 'NODE_ENV must be staging');
  }

  for (const key of ['WEB_URL', 'API_URL', 'NEXT_PUBLIC_API_URL']) {
    const url = parseUrl(values[key]);
    if (!values[key]) {
      continue;
    }
    if (!url) {
      addFailure(failures, 'PUBLIC_URL', `${key} must be a valid absolute URL`);
      continue;
    }
    if (url.protocol !== 'https:') {
      addFailure(failures, 'HTTPS', `${key} must use HTTPS`);
    }
    if (isLoopbackHost(url.hostname)) {
      addFailure(
        failures,
        'LOCALHOST',
        `${key} must not use a localhost address`,
      );
    }
    assertOriginOnly(key, url, failures);
  }

  const webUrl = parseUrl(values.WEB_URL);
  const apiUrl = parseUrl(values.API_URL);
  const publicApiUrl = parseUrl(values.NEXT_PUBLIC_API_URL);

  if (values.ALLOWED_ORIGINS) {
    const origins = values.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const normalizedOrigins = origins.map((origin) => {
      const url = parseUrl(origin);
      return url ? url.origin : origin;
    });
    if (webUrl && !normalizedOrigins.includes(webUrl.origin)) {
      addFailure(failures, 'CORS', 'ALLOWED_ORIGINS must include WEB_URL');
    }
    for (const origin of origins) {
      const url = parseUrl(origin);
      if (!url || url.protocol !== 'https:') {
        addFailure(failures, 'HTTPS', 'ALLOWED_ORIGINS must use HTTPS origins');
        break;
      }
      assertOriginOnly('ALLOWED_ORIGINS', url, failures);
      if (isLoopbackHost(url.hostname)) {
        addFailure(
          failures,
          'LOCALHOST',
          'ALLOWED_ORIGINS must not use localhost',
        );
        break;
      }
    }
  }

  for (const key of ['STAGING_WEB_HOST', 'STAGING_API_HOST']) {
    const host = values[key];
    if (!host) {
      continue;
    }
    if (host.includes('/') || host.includes(':') || /\s/.test(host)) {
      addFailure(
        failures,
        'HOST',
        `${key} must be a bare hostname, not a URL or path`,
      );
      continue;
    }
    if (!BARE_HOST_PATTERN.test(host)) {
      addFailure(failures, 'HOST', `${key} must be a valid hostname`);
    }
    if (isLoopbackHost(host)) {
      addFailure(failures, 'LOCALHOST', `${key} must not be localhost`);
    }
    if (mode === 'live' && (isPlaceholder(host) || host.endsWith('.invalid'))) {
      addFailure(
        failures,
        'PLACEHOLDER_HOST',
        `${key} must not use a placeholder or .invalid hostname in live staging`,
      );
    }
  }

  if (webUrl && values.STAGING_WEB_HOST && webUrl.hostname !== values.STAGING_WEB_HOST) {
    addFailure(
      failures,
      'HOST_MISMATCH',
      'WEB_URL hostname must equal STAGING_WEB_HOST',
    );
  }
  if (apiUrl && values.STAGING_API_HOST && apiUrl.hostname !== values.STAGING_API_HOST) {
    addFailure(
      failures,
      'HOST_MISMATCH',
      'API_URL hostname must equal STAGING_API_HOST',
    );
  }
  if (apiUrl && publicApiUrl && apiUrl.origin !== publicApiUrl.origin) {
    addFailure(
      failures,
      'PUBLIC_API_MISMATCH',
      'NEXT_PUBLIC_API_URL origin must equal API_URL origin',
    );
  }

  if (values.STAGING_ACME_EMAIL) {
    if (
      !ACME_EMAIL_PATTERN.test(values.STAGING_ACME_EMAIL) ||
      isPlaceholder(values.STAGING_ACME_EMAIL)
    ) {
      addFailure(
        failures,
        'ACME_EMAIL',
        'STAGING_ACME_EMAIL must be a valid email-like ACME contact',
      );
    }
    if (mode === 'live' && values.STAGING_ACME_EMAIL.endsWith('.invalid')) {
      addFailure(
        failures,
        'PLACEHOLDER_HOST',
        'STAGING_ACME_EMAIL must not use a .invalid host in live staging',
      );
    }
  }

  for (const key of ['DATABASE_URL', 'REDIS_URL']) {
    const url = parseUrl(values[key]);
    if (!values[key]) {
      continue;
    }
    if (!url) {
      addFailure(failures, 'SERVICE_URL', `${key} must be a valid URL`);
      continue;
    }
    if (isLoopbackHost(url.hostname)) {
      addFailure(
        failures,
        'LOCALHOST',
        `${key} must not use a localhost address`,
      );
    }
    if (key === 'DATABASE_URL' && !['postgres:', 'postgresql:'].includes(url.protocol)) {
      addFailure(
        failures,
        'SERVICE_URL',
        'DATABASE_URL must use a PostgreSQL-compatible protocol',
      );
    }
    if (key === 'REDIS_URL' && !['redis:', 'rediss:'].includes(url.protocol)) {
      addFailure(
        failures,
        'SERVICE_URL',
        'REDIS_URL must use redis or rediss',
      );
    }
  }

  if (
    values.DATABASE_URL &&
    (values.DATABASE_URL.includes('founderchatters:founderchatters') ||
      (values.POSTGRES_USER === 'founderchatters' &&
        values.POSTGRES_PASSWORD === 'founderchatters'))
  ) {
    addFailure(
      failures,
      'DEV_CREDENTIALS',
      'Staging must not reuse development database credentials',
    );
  }

  if (values.POSTGRES_DB === 'founderchatters') {
    addFailure(
      failures,
      'DEV_DATABASE',
      'POSTGRES_DB must not reuse the development database name',
    );
  }

  if (mode === 'live') {
    failures.push(...evaluateStagingDataPlaneTargets(values).failures);
  }

  const trustedProxy = evaluateStagingComposeTrustedProxy(
    values.TRUST_PROXY_ADDRESSES,
  );
  if (!trustedProxy.ok) {
    addFailure(failures, 'TRUST_PROXY', trustedProxy.message);
  }

  for (const key of [
    'SESSION_SECRET',
    'AUTH_TOKEN_SECRET',
    'PASSWORD_PEPPER',
    'POSTGRES_PASSWORD',
  ]) {
    if (values[key] && isWeakSecret(values[key])) {
      addFailure(
        failures,
        'WEAK_SECRET',
        `${key} is a placeholder or weak secret`,
      );
    }
  }

  if (values.EMAIL_FROM && (isPlaceholder(values.EMAIL_FROM) || !ACME_EMAIL_PATTERN.test(values.EMAIL_FROM))) {
    addFailure(
      failures,
      'EMAIL_FROM',
      'EMAIL_FROM must not be an obvious placeholder',
    );
  }
  if (mode === 'live' && values.EMAIL_FROM?.endsWith('.invalid')) {
    addFailure(
      failures,
      'EMAIL_FROM',
      'EMAIL_FROM must not use a .invalid host in live staging',
    );
  }

  if (values.STAGING_BACKUP_DIR) {
    const backupDir = values.STAGING_BACKUP_DIR;
    if (
      !isAbsolute(backupDir) &&
      !posix.isAbsolute(backupDir)
    ) {
      addFailure(
        failures,
        'BACKUP_DIR',
        'STAGING_BACKUP_DIR must be an absolute path',
      );
    } else if (backupDir === '/' || /^[A-Za-z]:[\\/]?$/.test(backupDir)) {
      addFailure(
        failures,
        'BACKUP_DIR',
        'STAGING_BACKUP_DIR must not be the filesystem root',
      );
    }
  }

  const emailProvider = values.EMAIL_PROVIDER?.trim().toLowerCase();
  if (
    !emailProvider ||
    emailProvider === 'memory' ||
    emailProvider === 'console' ||
    emailProvider === 'unconfigured' ||
    !APPROVED_PRODUCTION_EMAIL_PROVIDERS.includes(emailProvider)
  ) {
    addFailure(
      failures,
      'HARD_BLOCKER_EMAIL_PROVIDER',
      'An approved production-capable transactional email provider is still required. EMAIL_PROVIDER=memory is rejected in staging. Do not silently select Resend, SES, SendGrid, or Postmark.',
    );
  }

  if (mode === 'live') {
    for (const key of [
      'STAGING_WEB_IMAGE',
      'STAGING_API_IMAGE',
      'STAGING_OPS_IMAGE',
    ]) {
      const error = evaluateImmutableImageRef(values[key], key);
      if (error) {
        addFailure(failures, 'IMMUTABLE_IMAGE', error);
      }
    }
  }

  return {
    ok: failures.length === 0,
    mode,
    failures,
  };
}

export function formatReadinessReport(result) {
  if (result.ok) {
    return 'Staging preflight passed.';
  }
  const lines = [
    'Staging preflight failed closed.',
    ...result.failures.map(
      (failure) => `- [${failure.code}] ${failure.message}`,
    ),
  ];
  return lines.join('\n');
}

export function collectSensitiveEnvValues(env = {}) {
  const secrets = [];
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (value == null) {
      continue;
    }
    const normalized = String(value);
    if (normalized.length === 0) {
      continue;
    }
    secrets.push({ key, value: normalized });
  }
  return secrets;
}

function secretAppearsInText(text, value) {
  if (value.length >= 8) {
    return text.includes(value);
  }
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`).test(text);
}

export function assertNoSecretLeak(text, env = {}) {
  const haystack = String(text ?? '');
  for (const { key, value } of collectSensitiveEnvValues(env)) {
    if (secretAppearsInText(haystack, value)) {
      throw new Error(`Refusing to print secret value for ${key}`);
    }
  }
}

export function printSafeCapturedOutput(text, env = {}) {
  const output = String(text ?? '');
  try {
    assertNoSecretLeak(output, env);
  } catch {
    return { ok: false, output: '' };
  }
  return { ok: true, output };
}

export function runCapturedOpsProcess(commandSpec, env = {}) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    encoding: 'utf8',
  });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const safe = printSafeCapturedOutput(combined, env);
  if (!safe.ok) {
    return {
      ok: false,
      status: 1,
      output: '',
      leaked: true,
    };
  }
  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    output: safe.output,
    leaked: false,
  };
}

export function evaluateSmokeRequestFailure(error, pathname) {
  const name = error?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return {
      ok: false,
      message: `${pathname} timed out`,
    };
  }
  return {
    ok: false,
    message: 'Staging smoke request failed',
  };
}

export function createSmokeAbortSignal(
  timeoutMs = SMOKE_REQUEST_TIMEOUT_MS,
) {
  return AbortSignal.timeout(timeoutMs);
}

export function evaluateSmokeTargets({ webUrl, apiUrl }) {
  const failures = [];
  for (const [name, value] of [
    ['WEB_URL', webUrl],
    ['API_URL', apiUrl],
  ]) {
    if (isBlank(value)) {
      addFailure(failures, 'MISSING_URL', `${name} is required for smoke`);
      continue;
    }
    const url = parseUrl(value);
    if (!url) {
      addFailure(failures, 'PUBLIC_URL', `${name} must be a valid absolute URL`);
      continue;
    }
    if (url.protocol !== 'https:') {
      addFailure(failures, 'HTTPS', `${name} must use HTTPS`);
    }
    if (isLoopbackHost(url.hostname)) {
      addFailure(
        failures,
        'LOCALHOST',
        `${name} must not use a localhost address`,
      );
    }
  }
  return {
    ok: failures.length === 0,
    failures,
  };
}

export function evaluateBackupGuards({
  nodeEnv,
  confirm,
  backupDir,
  envFile,
  envFileExplicit = false,
  postgresUser,
  postgresDb,
}) {
  const failures = [];
  failures.push(...evaluateRequiredExplicitEnvFile(envFileExplicit).failures);
  if (nodeEnv !== 'staging') {
    addFailure(failures, 'NODE_ENV', 'NODE_ENV must be staging');
  }
  if (confirm !== STAGING_BACKUP_CONFIRM) {
    addFailure(
      failures,
      'CONFIRM',
      'STAGING_BACKUP_CONFIRM must be the documented confirmation value',
    );
  }
  if (isBlank(envFile)) {
    addFailure(failures, 'ENV_FILE', 'An explicit staging env file is required');
  }
  if (isBlank(backupDir) || (!isAbsolute(backupDir) && !posix.isAbsolute(backupDir))) {
    addFailure(failures, 'BACKUP_DIR', 'STAGING_BACKUP_DIR must be absolute');
  }
  if (backupDir === '/') {
    addFailure(failures, 'BACKUP_DIR', 'STAGING_BACKUP_DIR must not be root');
  }
  if (isBlank(postgresUser) || isBlank(postgresDb)) {
    addFailure(failures, 'MISSING_ENV', 'PostgreSQL identity is required');
  }
  return {
    ok: failures.length === 0,
    failures,
  };
}

export function backupTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.(\d+)Z$/, '$1Z');
}

export function evaluateBackupArtifactCollision({
  finalExists = false,
  partialExists = false,
}) {
  if (finalExists) {
    return {
      ok: false,
      message: 'Backup artifact already exists',
    };
  }
  if (partialExists) {
    return {
      ok: false,
      message: 'Backup partial artifact already exists',
    };
  }
  return { ok: true };
}

export function evaluateBackupCleanup({ createdPartial, finalized }) {
  return {
    deletePartial: Boolean(createdPartial) && !finalized,
    deleteFinal: false,
  };
}

export function backupArtifactNames(stamp) {
  const finalName = `founderchatters-staging-${stamp}.dump`;
  return {
    finalName,
    partialName: `${finalName}.partial`,
  };
}

export function evaluateStreamedDumpResult({ exitCode, bytesWritten }) {
  if (exitCode !== 0 || !bytesWritten) {
    return { ok: false, message: 'Backup dump failed.' };
  }
  return { ok: true };
}

export function evaluatePgRestoreList(output) {
  const text = String(output ?? '');
  if (!text.trim()) {
    return { ok: false, message: 'Backup listing is empty' };
  }
  if (!/\bTOC\b/i.test(text) && !/\d+; \d+ \d+/.test(text)) {
    return { ok: false, message: 'Backup listing is not a custom-format archive' };
  }
  return { ok: true };
}

export function isForbiddenPrismaCommand(requested) {
  const value = String(requested ?? '').toLowerCase();
  return ['migrate dev', 'db push', 'migrate reset', 'db execute'].some(
    (command) => value.includes(command),
  );
}
