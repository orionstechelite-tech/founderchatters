import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  parseEnvFile,
  parseEnvFileOption,
  resolvePreflightEnvFile,
} from './staging-env.mjs';
import {
  CADDYFILE,
  COMPOSE_FILE,
  EXPLICIT_ENV_FILE_MESSAGE,
  assertNoSecretLeak,
  dockerCaddyValidateCommand,
  dockerComposeConfigCommand,
  evaluatePreflightExecution,
  evaluateStagingReadiness,
  formatReadinessReport,
} from './staging-readiness.mjs';

function genericDockerFailure(code, message) {
  return {
    ok: false,
    failures: [{ code, message }],
  };
}

function runQuiet(commandSpec, env) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    encoding: 'utf8',
  });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assertNoSecretLeak(combined, env);
  if (result.status !== 0) {
    return false;
  }
  return true;
}

function validateCompose(envFile, env) {
  const command = dockerComposeConfigCommand(resolve(envFile), resolve(COMPOSE_FILE));
  if (!runQuiet(command, env)) {
    return genericDockerFailure(
      'COMPOSE',
      'docker compose config failed for the supplied staging environment file',
    );
  }
  return { ok: true, failures: [] };
}

function validateCaddy(env) {
  const command = dockerCaddyValidateCommand({
    caddyfile: resolve(CADDYFILE),
    webHost: env.STAGING_WEB_HOST,
    apiHost: env.STAGING_API_HOST,
    acmeEmail: env.STAGING_ACME_EMAIL,
  });
  if (!runQuiet(command, env)) {
    return genericDockerFailure(
      'CADDY',
      'Caddyfile validation failed',
    );
  }
  return { ok: true, failures: [] };
}

function main() {
  const options = parseEnvFileOption(process.argv.slice(2));
  const resolvedEnv = resolvePreflightEnvFile(options);
  if (!resolvedEnv.ok) {
    console.error(EXPLICIT_ENV_FILE_MESSAGE);
    process.exitCode = 1;
    return;
  }
  const env = parseEnvFile(resolvedEnv.envFile);
  const execution = evaluatePreflightExecution({
    envFile: resolvedEnv.envFile,
    mode: options.mode,
    skipDocker: options.skipDocker,
    envFileExplicit: resolvedEnv.envFileExplicit,
  });
  if (!execution.ok && execution.failures.some((failure) => failure.code === 'ENV_FILE')) {
    const report = formatReadinessReport(execution);
    console.error(report);
    process.exitCode = 1;
    return;
  }
  const readiness = evaluateStagingReadiness(env, {
    envFile: resolvedEnv.envFile,
    mode: execution.mode,
  });
  const compose = execution.skipDocker
    ? { ok: true, failures: [] }
    : validateCompose(resolvedEnv.envFile, env);
  const caddy = execution.skipDocker
    ? { ok: true, failures: [] }
    : validateCaddy(env);
  const result = {
    ok: execution.ok && readiness.ok && compose.ok && caddy.ok,
    mode: execution.mode,
    failures: [
      ...execution.failures,
      ...readiness.failures,
      ...compose.failures,
      ...caddy.failures,
    ],
  };
  const report = formatReadinessReport(result);
  assertNoSecretLeak(report, env);
  console.log(report);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Staging preflight failed.';
  console.error(message);
  process.exitCode = 1;
}
