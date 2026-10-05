import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { parseEnvFile } from './staging-env.mjs';
import {
  CADDYFILE,
  assertNoSecretLeak,
  dockerCaddyValidateCommand,
} from './staging-readiness.mjs';

function main() {
  const envFile = resolve('deploy/staging/.env.staging.validation');
  const env = parseEnvFile(envFile);
  const command = dockerCaddyValidateCommand({
    caddyfile: resolve(CADDYFILE),
    webHost: env.STAGING_WEB_HOST,
    apiHost: env.STAGING_API_HOST,
    acmeEmail: env.STAGING_ACME_EMAIL,
  });
  const result = spawnSync(command.command, command.args, {
    encoding: 'utf8',
  });
  assertNoSecretLeak(`${result.stdout ?? ''}${result.stderr ?? ''}`, env);
  if (result.status !== 0) {
    console.error('Caddyfile validation failed');
    process.exitCode = 1;
    return;
  }
  console.log('Caddyfile validation passed.');
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Caddy validation failed.';
  console.error(message);
  process.exitCode = 1;
}
