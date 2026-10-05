import { resolve } from 'node:path';

import { parseEnvFile, parseEnvFileOption } from './staging-env.mjs';
import {
  COMPOSE_FILE,
  EXPLICIT_ENV_FILE_MESSAGE,
  assertNoSecretLeak,
  dockerComposeOpsCommand,
  evaluateStagingOperatorGuards,
  formatReadinessReport,
  runCapturedOpsProcess,
} from './staging-readiness.mjs';

function main() {
  const options = parseEnvFileOption(process.argv.slice(2));
  if (!options.envFileExplicit) {
    console.error(EXPLICIT_ENV_FILE_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile(options.envFile);
  const guards = evaluateStagingOperatorGuards(env, {
    envFileExplicit: options.envFileExplicit,
  });
  if (!guards.ok) {
    const report = formatReadinessReport(guards);
    assertNoSecretLeak(report, env);
    console.error(report);
    process.exitCode = 1;
    return;
  }

  const extra = process.argv.slice(2).filter((argument, index, all) => {
    if (
      argument === '--env-file' ||
      argument === '--validation' ||
      argument === '--live' ||
      argument === '--skip-docker' ||
      argument === '--confirm-backup' ||
      argument === '--confirm-migrate-deploy'
    ) {
      return false;
    }
    return all[index - 1] !== '--env-file';
  });

  const command = dockerComposeOpsCommand({
    envFile: resolve(options.envFile),
    composeFile: resolve(COMPOSE_FILE),
    serviceArgs: ['rbac-sync', ...extra],
  });
  const result = runCapturedOpsProcess(command, env);
  if (result.leaked) {
    console.error('Operation failed.');
    process.exitCode = 1;
    return;
  }
  if (result.output) {
    process.stdout.write(result.output);
  }
  process.exitCode = result.status;
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'RBAC catalog sync failed.';
  console.error(message);
  process.exitCode = 1;
}
