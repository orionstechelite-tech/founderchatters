import { isIP } from 'node:net';
import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({
  path: resolve(process.cwd(), '../../.env'),
  quiet: true,
});
loadEnvironment({ quiet: true });

export type RuntimeEnvironment =
  'development' | 'test' | 'staging' | 'production';

const SUPPORTED_ENVIRONMENTS = new Set<RuntimeEnvironment>([
  'development',
  'test',
  'staging',
  'production',
]);

function environment(): RuntimeEnvironment {
  const value = process.env.NODE_ENV?.trim() || 'development';
  if (!SUPPORTED_ENVIRONMENTS.has(value as RuntimeEnvironment)) {
    throw new Error(
      `NODE_ENV must be one of: ${[...SUPPORTED_ENVIRONMENTS].join(', ')}`,
    );
  }
  return value as RuntimeEnvironment;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function isDeployedRuntimeEnvironment(
  runtimeEnvironment: RuntimeEnvironment,
): boolean {
  return (
    runtimeEnvironment === 'staging' || runtimeEnvironment === 'production'
  );
}

export function usesSecureCookies(
  runtimeEnvironment: RuntimeEnvironment,
): boolean {
  return isDeployedRuntimeEnvironment(runtimeEnvironment);
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '[::1]'
  );
}

function isWeakSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 32) {
    return true;
  }
  return (
    normalized === 'replace-me' ||
    normalized === 'changeme' ||
    normalized === 'change-me' ||
    normalized === 'your-secret-here' ||
    normalized === 'password' ||
    normalized === 'secret' ||
    normalized === 'founderchatters' ||
    normalized.startsWith('local-') ||
    normalized.includes('replace-me') ||
    normalized.includes('change-me')
  );
}

function isOverlyBroadTrustedProxy(value: string): boolean {
  const [address, prefix] = value.split('/');
  return (
    address === '*' ||
    address === '0.0.0.0' ||
    address === '::' ||
    prefix === '0'
  );
}

function assertNonLocalPublicOrigin(
  name: string,
  value: string,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  if (!isDeployedRuntimeEnvironment(runtimeEnvironment)) {
    return;
  }
  const url = new URL(value);
  if (isLoopbackHost(url.hostname)) {
    throw new Error(
      `${name} must not use a localhost address in staging and production`,
    );
  }
}

function deployedServiceUrl(
  name: string,
  value: string,
  runtimeEnvironment: RuntimeEnvironment,
): string {
  if (!isDeployedRuntimeEnvironment(runtimeEnvironment)) {
    return value;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (isLoopbackHost(url.hostname)) {
    throw new Error(
      `${name} must not use a localhost address in staging and production`,
    );
  }
  if (
    name === 'DATABASE_URL' &&
    decodeURIComponent(url.username) === 'founderchatters' &&
    decodeURIComponent(url.password) === 'founderchatters'
  ) {
    throw new Error(
      'DATABASE_URL must not reuse development credentials in staging and production',
    );
  }
  return value;
}

export function evaluateTrustedProxyAddresses(
  value: string | undefined,
  runtimeEnvironment: RuntimeEnvironment,
): false | string[] {
  if (!value?.trim()) {
    if (isDeployedRuntimeEnvironment(runtimeEnvironment)) {
      throw new Error(
        'TRUST_PROXY_ADDRESSES is required in staging and production; use "none" when no reverse proxy is present',
      );
    }
    return false;
  }
  if (value.trim().toLowerCase() === 'none') {
    return false;
  }

  const addresses = value.split(',').map((address) => address.trim());
  if (addresses.some((address) => !isValidIpOrCidr(address))) {
    throw new Error(
      'TRUST_PROXY_ADDRESSES must contain only comma-separated IP addresses or CIDRs',
    );
  }
  if (addresses.some((address) => isOverlyBroadTrustedProxy(address))) {
    throw new Error(
      'TRUST_PROXY_ADDRESSES must not trust every address; list the reverse-proxy hop only',
    );
  }
  return addresses;
}

function isValidIpOrCidr(value: string): boolean {
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

function secret(
  name: string,
  environment: RuntimeEnvironment,
  fallback: string,
): string {
  const value = required(
    name,
    isDeployedRuntimeEnvironment(environment) ? undefined : fallback,
  );
  if (isDeployedRuntimeEnvironment(environment) && isWeakSecret(value)) {
    throw new Error(`${name} must be a strong ${environment} secret`);
  }
  return value;
}

export function resolveLogLevel(
  runtimeEnvironment: RuntimeEnvironment,
  rawValue = process.env.LOG_LEVEL,
): string {
  const raw = rawValue?.trim().toLowerCase();
  if (!raw) {
    return runtimeEnvironment === 'development' ? 'debug' : 'log';
  }
  const mapped = raw === 'info' ? 'log' : raw;
  if (!['error', 'warn', 'log', 'debug', 'verbose'].includes(mapped)) {
    throw new Error(
      'LOG_LEVEL must be one of: error, warn, log, info, debug, verbose',
    );
  }
  return mapped;
}

export type NestLogLevel =
  'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal';

export function nestLoggerLevels(logLevel: string): NestLogLevel[] {
  switch (logLevel) {
    case 'verbose':
      return ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
    case 'debug':
      return ['debug', 'log', 'warn', 'error', 'fatal'];
    case 'warn':
      return ['warn', 'error', 'fatal'];
    case 'error':
      return ['error', 'fatal'];
    default:
      return ['log', 'warn', 'error', 'fatal'];
  }
}

function applicationOrigin(
  value: string,
  runtimeEnvironment: RuntimeEnvironment,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WEB_URL must be a valid absolute URL origin');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    throw new Error(
      'WEB_URL must be an origin only, without credentials, path, query, or fragment',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('WEB_URL must use HTTP or HTTPS');
  }
  if (
    isDeployedRuntimeEnvironment(runtimeEnvironment) &&
    url.protocol !== 'https:'
  ) {
    throw new Error('WEB_URL must use HTTPS in staging and production');
  }
  assertNonLocalPublicOrigin('WEB_URL', url.origin, runtimeEnvironment);
  return url.origin;
}

function allowedOrigins(
  runtimeEnvironment: RuntimeEnvironment,
  webUrl: string,
): Set<string> {
  const value = required(
    'ALLOWED_ORIGINS',
    isDeployedRuntimeEnvironment(runtimeEnvironment)
      ? undefined
      : 'http://localhost:3000',
  );
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('ALLOWED_ORIGINS is required');
  }
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(
        'ALLOWED_ORIGINS must contain valid absolute URL origins',
      );
    }
    if (
      isDeployedRuntimeEnvironment(runtimeEnvironment) &&
      url.protocol !== 'https:'
    ) {
      throw new Error(
        'ALLOWED_ORIGINS must use HTTPS in staging and production',
      );
    }
    assertNonLocalPublicOrigin(
      'ALLOWED_ORIGINS',
      url.origin,
      runtimeEnvironment,
    );
  }
  if (
    isDeployedRuntimeEnvironment(runtimeEnvironment) &&
    !origins.includes(webUrl)
  ) {
    throw new Error('ALLOWED_ORIGINS must include WEB_URL');
  }
  return new Set(origins);
}

@Injectable()
export class AppConfig {
  readonly environment = environment();
  readonly databaseUrl = deployedServiceUrl(
    'DATABASE_URL',
    required('DATABASE_URL'),
    this.environment,
  );
  readonly redisUrl = deployedServiceUrl(
    'REDIS_URL',
    required('REDIS_URL'),
    this.environment,
  );
  readonly webUrl = applicationOrigin(
    required(
      'WEB_URL',
      isDeployedRuntimeEnvironment(this.environment)
        ? undefined
        : 'http://localhost:3000',
    ),
    this.environment,
  );
  readonly sessionCookieName =
    process.env.SESSION_COOKIE_NAME?.trim() || 'fc_session';
  readonly sessionSecret = secret(
    'SESSION_SECRET',
    this.environment,
    'local-session-secret',
  );
  readonly passwordPepper = secret(
    'PASSWORD_PEPPER',
    this.environment,
    'local-password-pepper',
  );
  readonly authTokenSecret = secret(
    'AUTH_TOKEN_SECRET',
    this.environment,
    'local-auth-token-secret',
  );
  readonly allowedOrigins = allowedOrigins(this.environment, this.webUrl);
  readonly trustedProxyAddresses = evaluateTrustedProxyAddresses(
    process.env.TRUST_PROXY_ADDRESSES,
    this.environment,
  );
  readonly logLevel = resolveLogLevel(this.environment);
  readonly emailProvider = this.resolveEmailProvider();

  get isProduction(): boolean {
    return this.environment === 'production';
  }

  get isDeployedEnvironment(): boolean {
    return isDeployedRuntimeEnvironment(this.environment);
  }

  get secureCookies(): boolean {
    return usesSecureCookies(this.environment);
  }

  private resolveEmailProvider(): 'memory' {
    const value =
      process.env.EMAIL_PROVIDER?.trim().toLowerCase() ||
      (this.environment === 'development' || this.environment === 'test'
        ? 'memory'
        : 'unconfigured');
    if (this.environment === 'staging' || this.environment === 'production') {
      throw new Error(
        'An approved production-capable EMAIL_PROVIDER is required in staging and production',
      );
    }
    if (value === 'memory' || value === 'console') {
      return 'memory';
    }
    throw new Error(
      'EMAIL_PROVIDER must be "memory" in development and test until a production adapter is approved',
    );
  }
}
