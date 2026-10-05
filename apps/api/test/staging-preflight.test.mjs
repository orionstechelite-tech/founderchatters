import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseEnvFileOption,
  resolvePreflightEnvFile,
  resolveProcessConfirmation,
} from '../../../scripts/staging-env.mjs';
import {
  APPROVED_PRODUCTION_EMAIL_PROVIDERS,
  EXPLICIT_ENV_FILE_MESSAGE,
  STAGING_BACKUP_CONFIRM,
  STAGING_MIGRATE_DEPLOY_CONFIRM,
  STAGING_WEB_RUNTIME_NODE_ENV,
  assertNoSecretLeak,
  backupArtifactNames,
  backupTimestamp,
  composeServiceHasBuild,
  composeServiceImage,
  composeServiceNodeEnv,
  composeServicePublishesPorts,
  dockerCaddyValidateCommand,
  dockerComposeBackupDumpCommand,
  dockerComposeConfigCommand,
  dockerComposeDataPlaneUpCommand,
  dockerComposeHumanRecreateDatabaseCommand,
  dockerComposeHumanRestoreIntoCleanDatabaseCommand,
  dockerComposeOpsCommand,
  evaluateBackupArtifactCollision,
  evaluateBackupCleanup,
  evaluateBackupGuards,
  evaluateDockerComposeRunHelpSupportsPull,
  evaluateImmutableImageRef,
  evaluatePgRestoreList,
  evaluatePreflightExecution,
  evaluateRuntimeComposeHasNoApplicationBuilds,
  evaluateSmokeRequestFailure,
  evaluateSmokeStatus,
  evaluateSmokeTargets,
  evaluateStagingComposeTrustedProxy,
  evaluateStagingDataPlaneTargets,
  evaluateStagingOperatorGuards,
  evaluateStagingReadiness,
  evaluateStagingWebRuntimeNodeEnv,
  evaluateStreamedDumpResult,
  evaluateTrustedProxyAddresses,
  formatReadinessReport,
  isForbiddenPrismaCommand,
  printSafeCapturedOutput,
  resolvePreflightMode,
} from '../../../scripts/staging-readiness.mjs';

const validationEnv = {
  NODE_ENV: 'staging',
  WEB_URL: 'https://app.staging.example.invalid',
  API_URL: 'https://api.staging.example.invalid',
  NEXT_PUBLIC_API_URL: 'https://api.staging.example.invalid',
  ALLOWED_ORIGINS: 'https://app.staging.example.invalid',
  TRUST_PROXY_ADDRESSES: '172.30.0.10',
  DATABASE_URL:
    'postgresql://staging_user:staging_pass_not_for_reuse_123456@postgres:5432/founderchatters_staging',
  REDIS_URL: 'redis://redis:6379',
  SESSION_COOKIE_NAME: 'fc_session',
  SESSION_SECRET: 'S'.repeat(48),
  AUTH_TOKEN_SECRET: 'A'.repeat(48),
  PASSWORD_PEPPER: 'P'.repeat(48),
  EMAIL_PROVIDER: 'unapproved-vendor',
  EMAIL_FROM: 'no-reply@staging.example.invalid',
  POSTGRES_USER: 'staging_user',
  POSTGRES_PASSWORD: 'staging_pass_not_for_reuse_123456',
  POSTGRES_DB: 'founderchatters_staging',
  STAGING_WEB_HOST: 'app.staging.example.invalid',
  STAGING_API_HOST: 'api.staging.example.invalid',
  STAGING_ACME_EMAIL: 'operator@staging.example.invalid',
  STAGING_BACKUP_DIR: '/var/backups/founderchatters-staging',
  STAGING_WEB_IMAGE: 'founderchatters-web:local',
  STAGING_API_IMAGE: 'founderchatters-api:local',
  STAGING_OPS_IMAGE: 'founderchatters-ops:local',
};

const liveEnv = {
  ...validationEnv,
  WEB_URL: 'https://app.staging.founders.test',
  API_URL: 'https://api.staging.founders.test',
  NEXT_PUBLIC_API_URL: 'https://api.staging.founders.test',
  ALLOWED_ORIGINS: 'https://app.staging.founders.test',
  EMAIL_FROM: 'no-reply@staging.founders.test',
  STAGING_WEB_HOST: 'app.staging.founders.test',
  STAGING_API_HOST: 'api.staging.founders.test',
  STAGING_ACME_EMAIL: 'operator@staging.founders.test',
  STAGING_WEB_IMAGE:
    'founderchatters-web:e002af3777fa5660e1a9d08d473379e9704aa031',
  STAGING_API_IMAGE:
    'founderchatters-api:e002af3777fa5660e1a9d08d473379e9704aa031',
  STAGING_OPS_IMAGE:
    'founderchatters-ops:e002af3777fa5660e1a9d08d473379e9704aa031',
};

describe('staging preflight', () => {
  it('keeps the production email provider list empty and fail-closed', () => {
    expect(APPROVED_PRODUCTION_EMAIL_PROVIDERS).toEqual([]);
    const result = evaluateStagingReadiness(validationEnv, {
      envFile: 'deploy/staging/.env.staging.validation',
      mode: 'validation',
    });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('validation');
    expect(result.failures.map((failure) => failure.code)).toContain(
      'HARD_BLOCKER_EMAIL_PROVIDER',
    );
    const report = formatReadinessReport(result);
    expect(report).toContain(
      'approved production-capable transactional email provider',
    );
    expect(report).not.toContain(validationEnv.SESSION_SECRET);
    expect(report).not.toContain(validationEnv.PASSWORD_PEPPER);
  });

  it('does not treat the fictional validation file as a live environment', () => {
    expect(
      resolvePreflightMode({
        envFile: 'deploy/staging/.env.staging.validation',
      }),
    ).toBe('validation');
    const live = evaluateStagingReadiness(validationEnv, { mode: 'live' });
    expect(live.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        'PLACEHOLDER_HOST',
        'IMMUTABLE_IMAGE',
        'HARD_BLOCKER_EMAIL_PROVIDER',
      ]),
    );
  });

  it('uses the operator env file for compose and Caddy validation commands', () => {
    const operatorEnv = '/secure/operator/.env.staging';
    const compose = dockerComposeConfigCommand(operatorEnv);
    expect(compose.args).toContain(operatorEnv);
    expect(compose.args.join(' ')).not.toContain('.env.staging.validation');
    expect(compose.args).toContain('--quiet');

    const caddy = dockerCaddyValidateCommand({
      caddyfile: 'deploy/staging/Caddyfile',
      webHost: 'app.staging.founders.test',
      apiHost: 'api.staging.founders.test',
      acmeEmail: 'operator@staging.founders.test',
    });
    expect(caddy.args).toContain('validate');
    expect(caddy.args[caddy.args.indexOf('caddy') + 1]).toBe('validate');
    expect(caddy.args[1]).toBe('--rm');
  });

  it('rejects placeholder hosts, public-host mismatches, and mutable images in live mode', () => {
    const result = evaluateStagingReadiness(
      {
        ...liveEnv,
        STAGING_WEB_HOST: 'replace-me-web-host.example',
        WEB_URL: 'https://app.staging.founders.test',
        API_URL: 'https://other.staging.founders.test',
        NEXT_PUBLIC_API_URL: 'https://api.staging.founders.test',
        STAGING_API_HOST: 'api.staging.founders.test',
        ALLOWED_ORIGINS: 'https://app.staging.founders.test/path',
        STAGING_WEB_IMAGE: 'founderchatters-web:latest',
        STAGING_API_IMAGE: 'founderchatters-api:local',
        STAGING_BACKUP_DIR: '/',
        EMAIL_FROM: 'replace-me-email-from',
        DATABASE_URL: 'mysql://staging_user:staging_pass@postgres:5432/db',
        REDIS_URL: 'http://redis:6379',
      },
      { mode: 'live' },
    );
    const codes = result.failures.map((failure) => failure.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'PLACEHOLDER_HOST',
        'HOST_MISMATCH',
        'PUBLIC_API_MISMATCH',
        'ORIGIN',
        'IMMUTABLE_IMAGE',
        'BACKUP_DIR',
        'EMAIL_FROM',
        'SERVICE_URL',
        'HARD_BLOCKER_EMAIL_PROVIDER',
      ]),
    );
  });

  it('validates trusted-proxy lists the same way as AppConfig', () => {
    expect(evaluateTrustedProxyAddresses('172.30.0.10').ok).toBe(true);
    expect(evaluateTrustedProxyAddresses('172.30.0.10,10.1.0.4').ok).toBe(true);
    expect(evaluateTrustedProxyAddresses('0.0.0.0/0').ok).toBe(false);
    expect(evaluateTrustedProxyAddresses('10.0.0.0/99').ok).toBe(false);
    expect(
      evaluateImmutableImageRef(
        'founderchatters-api:latest',
        'STAGING_API_IMAGE',
      ),
    ).toMatch(/mutable/);
    expect(
      evaluateImmutableImageRef(
        'founderchatters-api:e002af3777fa5660e1a9d08d473379e9704aa031',
        'STAGING_API_IMAGE',
      ),
    ).toBeNull();
  });

  it('rejects placeholder secrets, HTTP public URLs, and localhost endpoints', () => {
    const result = evaluateStagingReadiness({
      ...validationEnv,
      NODE_ENV: 'development',
      WEB_URL: 'http://localhost:3000',
      API_URL: 'http://127.0.0.1:4000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      DATABASE_URL:
        'postgresql://founderchatters:founderchatters@localhost:5432/founderchatters',
      REDIS_URL: 'redis://localhost:6379',
      SESSION_SECRET: 'replace-me-replace-me-replace-me-secret',
      POSTGRES_USER: 'founderchatters',
      POSTGRES_PASSWORD: 'founderchatters',
      POSTGRES_DB: 'founderchatters',
      TRUST_PROXY_ADDRESSES: '0.0.0.0/0',
      EMAIL_PROVIDER: 'memory',
    });

    expect(result.ok).toBe(false);
    const codes = result.failures.map((failure) => failure.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'HTTPS',
        'LOCALHOST',
        'DEV_CREDENTIALS',
        'DEV_DATABASE',
        'WEAK_SECRET',
        'TRUST_PROXY',
        'HARD_BLOCKER_EMAIL_PROVIDER',
      ]),
    );
    expect(formatReadinessReport(result)).not.toContain(
      'replace-me-replace-me',
    );
  });

  it('refuses to print secret values', () => {
    expect(() =>
      assertNoSecretLeak(
        `leaked ${validationEnv.SESSION_SECRET}`,
        validationEnv,
      ),
    ).toThrow(/Refusing to print secret value/);
  });

  it('requires exact 200 smoke statuses and rejects 404/401/500', () => {
    expect(evaluateSmokeStatus('/', 200).ok).toBe(true);
    expect(evaluateSmokeStatus('/signin', 404).ok).toBe(false);
    expect(evaluateSmokeStatus('/signup', 401).ok).toBe(false);
    expect(evaluateSmokeStatus('/support', 403).ok).toBe(false);
    expect(evaluateSmokeStatus('/v1/health/live', 500).ok).toBe(false);
    expect(
      evaluateSmokeTargets({
        webUrl: 'http://localhost:3000',
        apiUrl: 'https://localhost:4000',
      }).failures.map((failure) => failure.code),
    ).toEqual(expect.arrayContaining(['HTTPS', 'LOCALHOST']));
  });

  it('keeps backup and migrate operations on the supplied staging compose env', () => {
    const envFile = '/secure/operator/.env.staging';
    const dump = dockerComposeBackupDumpCommand({
      envFile,
      postgresUser: 'staging_user',
      postgresDb: 'founderchatters_staging',
    });
    expect(dump.args).toContain(envFile);
    expect(dump.args).toContain('exec');
    expect(dump.args).toContain('--format=custom');
    expect(dump.args.join(' ')).not.toContain('.env.staging.validation');

    const migrate = dockerComposeOpsCommand({
      envFile,
      serviceArgs: ['prisma', 'migrate', 'status'],
    });
    expect(migrate.args).toContain('--profile');
    expect(migrate.args).toContain('ops');
    const pullIndex = migrate.args.indexOf('--pull');
    expect(pullIndex).toBeGreaterThan(-1);
    expect(migrate.args[pullIndex + 1]).toBe('never');
    expect(migrate.args).not.toContain('--build');
    const dataPlane = dockerComposeDataPlaneUpCommand({ envFile });
    expect(dataPlane.args).toEqual([
      'compose',
      '--env-file',
      envFile,
      '-f',
      'deploy/staging/docker-compose.yml',
      'up',
      '-d',
      'postgres',
      'redis',
    ]);
    expect(isForbiddenPrismaCommand('migrate dev')).toBe(true);
    expect(
      evaluateBackupGuards({
        nodeEnv: 'development',
        confirm: 'no',
        backupDir: '/',
        envFile: '',
        envFileExplicit: false,
        postgresUser: '',
        postgresDb: '',
      }).ok,
    ).toBe(false);
    expect(evaluatePgRestoreList('').ok).toBe(false);
    expect(evaluatePgRestoreList('; TOC:\n1; 0 0').ok).toBe(true);
    const names = backupArtifactNames('20261005T000000Z');
    expect(names.partialName).toBe(
      'founderchatters-staging-20261005T000000Z.dump.partial',
    );
    expect(
      evaluateStreamedDumpResult({ exitCode: 0, bytesWritten: 128 }).ok,
    ).toBe(true);
    expect(
      evaluateStreamedDumpResult({ exitCode: 1, bytesWritten: 128 }).ok,
    ).toBe(false);
    expect(
      evaluateStreamedDumpResult({ exitCode: 0, bytesWritten: 0 }).ok,
    ).toBe(false);
    const recreate = dockerComposeHumanRecreateDatabaseCommand({ envFile });
    expect(recreate.destructive).toBe(true);
    expect(recreate.humanOnly).toBe(true);
    expect(recreate.args.at(-1)).toContain('dropdb --if-exists');
    expect(recreate.args.at(-1)).toContain('createdb');
    const restore = dockerComposeHumanRestoreIntoCleanDatabaseCommand({
      envFile,
    });
    expect(restore.humanOnly).toBe(true);
    expect(restore.args.at(-1)).toBe(
      'pg_restore --exit-on-error --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"',
    );
    expect(restore.args.at(-1)).not.toContain('--clean');
  });

  it('uses compose run --pull never and confirms Docker Compose supports --pull', () => {
    const envFile = '/secure/operator/.env.staging';
    const migrate = dockerComposeOpsCommand({
      envFile,
      serviceArgs: ['prisma', 'migrate', 'status'],
    });
    expect(migrate.command).toBe('docker');
    expect(migrate.args).toEqual([
      'compose',
      '--env-file',
      envFile,
      '-f',
      'deploy/staging/docker-compose.yml',
      '--profile',
      'ops',
      'run',
      '--rm',
      '--no-deps',
      '--pull',
      'never',
      'ops',
      'prisma',
      'migrate',
      'status',
    ]);
    const help = spawnSync('docker', ['compose', 'run', '--help'], {
      encoding: 'utf8',
    });
    expect(help.error).toBeUndefined();
    expect(help.status).toBe(0);
    expect(
      evaluateDockerComposeRunHelpSupportsPull(
        `${help.stdout ?? ''}\n${help.stderr ?? ''}`,
      ),
    ).toBe(true);
  });

  it('keeps the web service on production NODE_ENV', () => {
    const compose = readFileSync(
      resolve(
        fileURLToPath(new URL('../../..', import.meta.url)),
        'deploy/staging/docker-compose.yml',
      ),
      'utf8',
    );
    expect(composeServiceNodeEnv(compose, 'web')).toBe('production');
    expect(composeServiceNodeEnv(compose, 'api')).toBe('${NODE_ENV}');
    expect(composeServiceNodeEnv(compose, 'worker')).toBe('${NODE_ENV}');
    expect(evaluateStagingWebRuntimeNodeEnv('production').ok).toBe(true);
    expect(evaluateStagingWebRuntimeNodeEnv('staging').ok).toBe(false);
    expect(STAGING_WEB_RUNTIME_NODE_ENV).toBe('production');
  });

  it('keeps runtime staging compose image-only for application and ops services', () => {
    const compose = readFileSync(
      resolve(
        fileURLToPath(new URL('../../..', import.meta.url)),
        'deploy/staging/docker-compose.yml',
      ),
      'utf8',
    );
    const runtime = evaluateRuntimeComposeHasNoApplicationBuilds(compose);
    expect(runtime.ok).toBe(true);
    expect(runtime.servicesWithBuild).toEqual([]);
    expect(composeServiceHasBuild(compose, 'web')).toBe(false);
    expect(composeServiceHasBuild(compose, 'api')).toBe(false);
    expect(composeServiceHasBuild(compose, 'worker')).toBe(false);
    expect(composeServiceHasBuild(compose, 'ops')).toBe(false);
    expect(composeServiceImage(compose, 'web')).toBe('${STAGING_WEB_IMAGE}');
    expect(composeServiceImage(compose, 'api')).toBe('${STAGING_API_IMAGE}');
    expect(composeServiceImage(compose, 'worker')).toBe('${STAGING_API_IMAGE}');
    expect(composeServiceImage(compose, 'ops')).toBe('${STAGING_OPS_IMAGE}');
    expect(composeServiceImage(compose, 'web')).not.toMatch(/:(latest|local)$/);
    expect(composeServiceImage(compose, 'api')).not.toMatch(/:(latest|local)$/);
    expect(composeServiceImage(compose, 'ops')).not.toMatch(/:(latest|local)$/);
    expect(composeServicePublishesPorts(compose, 'postgres')).toBe(false);
    expect(composeServicePublishesPorts(compose, 'redis')).toBe(false);
    expect(
      evaluateRuntimeComposeHasNoApplicationBuilds(`
services:
  web:
    image: \${STAGING_WEB_IMAGE}
    build:
      context: ../..
  api:
    image: \${STAGING_API_IMAGE}
  worker:
    image: \${STAGING_API_IMAGE}
  ops:
    image: \${STAGING_OPS_IMAGE}
`).servicesWithBuild,
    ).toEqual(['web']);
  });

  it('rejects forcing validation mode or skip-docker on a live env file', () => {
    const liveFile = '/secure/operator/.env.staging';
    const forcedValidation = evaluatePreflightExecution({
      envFile: liveFile,
      mode: 'validation',
      envFileExplicit: true,
    });
    expect(forcedValidation.ok).toBe(false);
    expect(forcedValidation.skipDocker).toBe(false);
    expect(forcedValidation.failures.map((failure) => failure.code)).toContain(
      'PREFLIGHT_MODE',
    );

    const skipLive = evaluatePreflightExecution({
      envFile: liveFile,
      mode: 'live',
      skipDocker: true,
      envFileExplicit: true,
    });
    expect(skipLive.ok).toBe(false);
    expect(skipLive.skipDocker).toBe(false);
    expect(skipLive.failures.map((failure) => failure.code)).toContain(
      'SKIP_DOCKER',
    );

    const validationSkip = evaluatePreflightExecution({
      envFile: 'deploy/staging/.env.staging.validation',
      mode: 'validation',
      skipDocker: true,
    });
    expect(validationSkip.ok).toBe(true);
    expect(validationSkip.skipDocker).toBe(true);
  });

  it('accepts only digest or 40-hex Git SHA image references in live mode', () => {
    const digest = `ghcr.io/example/founderchatters-api@sha256:${'a'.repeat(64)}`;
    expect(evaluateImmutableImageRef(digest, 'STAGING_API_IMAGE')).toBeNull();
    expect(
      evaluateImmutableImageRef(
        `founderchatters-web:sha-${'b'.repeat(40)}`,
        'STAGING_WEB_IMAGE',
      ),
    ).toBeNull();
    expect(
      evaluateImmutableImageRef(
        'founderchatters-api:staging',
        'STAGING_API_IMAGE',
      ),
    ).toMatch(/mutable/);
    expect(
      evaluateImmutableImageRef('founderchatters-api:dev', 'STAGING_API_IMAGE'),
    ).toMatch(/mutable/);
    expect(
      evaluateImmutableImageRef('founderchatters-api:v1', 'STAGING_API_IMAGE'),
    ).toMatch(/mutable/);
    expect(
      evaluateImmutableImageRef(
        'founderchatters-api:my-release',
        'STAGING_API_IMAGE',
      ),
    ).toMatch(/digest or 40-hex/);
    const live = evaluateStagingReadiness(
      {
        ...liveEnv,
        STAGING_WEB_IMAGE: 'founderchatters-web:v1',
      },
      { mode: 'live' },
    );
    expect(live.failures.map((failure) => failure.code)).toContain(
      'IMMUTABLE_IMAGE',
    );
  });

  it('requires the exact staging Caddy hop and rejects none', () => {
    expect(evaluateTrustedProxyAddresses('none').ok).toBe(true);
    expect(evaluateStagingComposeTrustedProxy('none').ok).toBe(false);
    expect(evaluateStagingComposeTrustedProxy('172.30.0.10').ok).toBe(true);
    expect(evaluateStagingComposeTrustedProxy('172.30.0.10,10.1.0.4').ok).toBe(
      false,
    );
    expect(evaluateStagingComposeTrustedProxy('0.0.0.0/0').ok).toBe(false);
    const none = evaluateStagingReadiness(
      { ...liveEnv, TRUST_PROXY_ADDRESSES: 'none' },
      { mode: 'live' },
    );
    expect(none.failures.map((failure) => failure.code)).toContain(
      'TRUST_PROXY',
    );
  });

  it('does not accept confirmation from the persistent env file', () => {
    const options = parseEnvFileOption([
      '--env-file',
      '/secure/operator/.env.staging',
    ]);
    const fromFileOnly = resolveProcessConfirmation({
      processValue: undefined,
      cliConfirmed: options.confirmBackup,
      expected: STAGING_BACKUP_CONFIRM,
    });
    expect(fromFileOnly).not.toBe(STAGING_BACKUP_CONFIRM);
    expect(
      evaluateBackupGuards({
        nodeEnv: 'staging',
        confirm: fromFileOnly,
        backupDir: '/var/backups/founderchatters-staging',
        envFile: '/secure/operator/.env.staging',
        envFileExplicit: true,
        postgresUser: 'staging_user',
        postgresDb: 'founderchatters_staging',
      }).ok,
    ).toBe(false);

    expect(
      resolveProcessConfirmation({
        processValue: STAGING_BACKUP_CONFIRM,
        cliConfirmed: false,
        expected: STAGING_BACKUP_CONFIRM,
      }),
    ).toBe(STAGING_BACKUP_CONFIRM);
    expect(
      resolveProcessConfirmation({
        processValue: undefined,
        cliConfirmed: true,
        expected: STAGING_MIGRATE_DEPLOY_CONFIRM,
      }),
    ).toBe(STAGING_MIGRATE_DEPLOY_CONFIRM);
    expect(
      evaluateBackupGuards({
        nodeEnv: 'staging',
        confirm: STAGING_BACKUP_CONFIRM,
        backupDir: '/var/backups/founderchatters-staging',
        envFile: '/secure/operator/.env.staging',
        envFileExplicit: true,
        postgresUser: 'staging_user',
        postgresDb: 'founderchatters_staging',
      }).ok,
    ).toBe(true);
  });

  it('redacts short secrets and password-bearing URLs', () => {
    const env = {
      POSTGRES_PASSWORD: 'ab',
      REDIS_URL: 'redis://:ab@redis:6379',
      DATABASE_URL: 'postgresql://u:ab@postgres:5432/db',
      SENTRY_DSN: 'https://short@example.invalid/1',
    };
    expect(() => assertNoSecretLeak('password=ab', env)).toThrow(
      /POSTGRES_PASSWORD/,
    );
    expect(() => assertNoSecretLeak('redis://:ab@redis:6379', env)).toThrow(
      /REDIS_URL/,
    );
    expect(
      printSafeCapturedOutput('postgresql://u:ab@postgres:5432/db', env),
    ).toEqual({ ok: false, output: '' });
    expect(
      printSafeCapturedOutput('Database schema is up to date.', env),
    ).toEqual({
      ok: true,
      output: 'Database schema is up to date.',
    });
    const weakPassword = evaluateStagingReadiness(
      { ...liveEnv, POSTGRES_PASSWORD: 'short-pass' },
      { mode: 'live' },
    );
    expect(weakPassword.failures.map((failure) => failure.code)).toContain(
      'WEAK_SECRET',
    );
  });

  it('fails smoke requests on timeout with a generic error', () => {
    const timeout = evaluateSmokeRequestFailure(
      Object.assign(new Error('The operation was aborted'), {
        name: 'TimeoutError',
      }),
      '/signin',
    );
    expect(timeout.ok).toBe(false);
    expect(timeout.message).toBe('/signin timed out');
    expect(timeout.message).not.toContain('https://');
    expect(
      evaluateSmokeRequestFailure(new Error('connect ECONNREFUSED'), '/')
        .message,
    ).toBe('Staging smoke request failed');
  });

  it('requires an explicit --env-file for live operator commands', () => {
    const missing = parseEnvFileOption([]);
    expect(missing.envFileExplicit).toBe(false);
    expect(missing.envFile).toBe('');
    expect(resolvePreflightEnvFile(missing).ok).toBe(false);
    expect(
      evaluatePreflightExecution({
        envFile: missing.envFile,
        envFileExplicit: false,
      }).failures.map((failure) => failure.code),
    ).toContain('ENV_FILE');

    const typo = parseEnvFileOption([
      '--envfile',
      'deploy/staging/.env.staging',
    ]);
    expect(typo.envFileExplicit).toBe(false);
    expect(typo.unknownFlags).toContain('--envfile');

    const flagAsPath = parseEnvFileOption(['--env-file', '--live']);
    expect(flagAsPath.envFileExplicit).toBe(false);

    const explicit = parseEnvFileOption([
      '--env-file',
      '/secure/operator/.env.staging',
    ]);
    expect(explicit.envFileExplicit).toBe(true);
    expect(explicit.envFile).toContain('.env.staging');

    const validationOnly = parseEnvFileOption(['--validation']);
    expect(validationOnly.envFileExplicit).toBe(false);
    const chosen = resolvePreflightEnvFile(validationOnly);
    expect(chosen.ok).toBe(true);
    expect(chosen.envFile).toContain('.env.staging.validation');
    expect(EXPLICIT_ENV_FILE_MESSAGE).toContain('--env-file');
  });

  it('binds live DATABASE_URL and REDIS_URL to the Compose data plane', () => {
    expect(evaluateStagingDataPlaneTargets(liveEnv).ok).toBe(true);
    expect(
      evaluateStagingOperatorGuards(liveEnv, { envFileExplicit: true }).ok,
    ).toBe(true);

    const host = evaluateStagingDataPlaneTargets({
      ...liveEnv,
      DATABASE_URL:
        'postgresql://staging_user:staging_pass_not_for_reuse_123456@prod-db.example.com:5432/founderchatters_staging',
    });
    expect(host.ok).toBe(false);
    expect(
      host.failures.map((failure) => failure.message).join('\n'),
    ).toContain('hostname postgres');
    expect(formatReadinessReport(host)).not.toContain('prod-db.example.com');

    const mismatch = evaluateStagingDataPlaneTargets({
      ...liveEnv,
      DATABASE_URL:
        'postgresql://other_user:other_password@postgres:5432/other_db',
    });
    expect(mismatch.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        'DATABASE_URL username must match POSTGRES_USER',
        'DATABASE_URL password must match POSTGRES_PASSWORD',
        'DATABASE_URL database must match POSTGRES_DB',
      ]),
    );

    const redisHost = evaluateStagingDataPlaneTargets({
      ...liveEnv,
      REDIS_URL: 'redis://cache.prod.example.com:6379',
    });
    expect(
      redisHost.failures.map((failure) => failure.message).join('\n'),
    ).toContain('hostname redis');

    const redisAuth = evaluateStagingDataPlaneTargets({
      ...liveEnv,
      REDIS_URL: 'redis://:secret@redis:6379',
    });
    expect(
      redisAuth.failures.map((failure) => failure.message).join('\n'),
    ).toContain('must not include credentials');

    const liveReadiness = evaluateStagingReadiness(
      {
        ...liveEnv,
        DATABASE_URL:
          'postgresql://staging_user:staging_pass_not_for_reuse_123456@prod-db.example.com:5432/founderchatters_staging',
      },
      { mode: 'live', envFile: '/secure/operator/.env.staging' },
    );
    expect(liveReadiness.failures.map((failure) => failure.code)).toContain(
      'DATA_PLANE',
    );
  });

  it('refuses colliding backup artifacts and deletes only unfinished partials', () => {
    expect(
      evaluateBackupArtifactCollision({
        finalExists: true,
        partialExists: false,
      }).ok,
    ).toBe(false);
    expect(
      evaluateBackupArtifactCollision({
        finalExists: false,
        partialExists: true,
      }).ok,
    ).toBe(false);
    expect(
      evaluateBackupArtifactCollision({
        finalExists: false,
        partialExists: false,
      }).ok,
    ).toBe(true);
    expect(
      evaluateBackupCleanup({ createdPartial: true, finalized: false }),
    ).toEqual({ deletePartial: true, deleteFinal: false });
    expect(
      evaluateBackupCleanup({ createdPartial: true, finalized: true }),
    ).toEqual({ deletePartial: false, deleteFinal: false });
    expect(backupTimestamp(new Date('2026-10-05T06:48:00.123Z'))).toBe(
      '20261005T064800123Z',
    );
    expect(
      evaluateBackupGuards({
        nodeEnv: 'staging',
        confirm: STAGING_BACKUP_CONFIRM,
        backupDir: '/var/backups/founderchatters-staging',
        envFile: '',
        envFileExplicit: false,
        postgresUser: 'staging_user',
        postgresDb: 'founderchatters_staging',
      }).failures.map((failure) => failure.code),
    ).toContain('ENV_FILE');
  });
});
