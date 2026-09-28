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

function trustedProxyAddresses(
  value: string | undefined,
  runtimeEnvironment: RuntimeEnvironment,
): false | string[] {
  if (!value?.trim()) {
    if (
      runtimeEnvironment === 'production' ||
      runtimeEnvironment === 'staging'
    ) {
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
    environment === 'production' ? undefined : fallback,
  );
  if (
    environment === 'production' &&
    (value.length < 32 || value === 'replace-me')
  ) {
    throw new Error(`${name} must be a strong production secret`);
  }
  return value;
}

@Injectable()
export class AppConfig {
  readonly environment = environment();
  readonly databaseUrl = required('DATABASE_URL');
  readonly redisUrl = required('REDIS_URL');
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
  readonly allowedOrigins = new Set(
    required(
      'ALLOWED_ORIGINS',
      this.environment === 'production' ? undefined : 'http://localhost:3000',
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  readonly trustedProxyAddresses = trustedProxyAddresses(
    process.env.TRUST_PROXY_ADDRESSES,
    this.environment,
  );

  get isProduction(): boolean {
    return this.environment === 'production';
  }
}
