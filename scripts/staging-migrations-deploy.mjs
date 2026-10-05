import { resolve } from 'node:path';

import {
  parseEnvFile,
  parseEnvFileOption,
  resolveProcessConfirmation,
} from './staging-env.mjs';
import {
  COMPOSE_FILE,
  EXPLICIT_ENV_FILE_MESSAGE,
  STAGING_MIGRATE_DEPLOY_CONFIRM,
  assertNoSecretLeak,
  dockerComposeOpsCommand,
  evaluateStagingOperatorGuards,
  formatReadinessReport,
  isForbiddenPrismaCommand,
  runCapturedOpsProcess,
} from './staging-readiness.mjs';

function main() {
  const requested = process.argv.slice(2).join(' ');
  if (isForbiddenPrismaCommand(requested)) {
    throw new Error(
      'Refusing unsafe Prisma command. Staging allows only prisma migrate status and prisma migrate deploy.',
    );
  }

  const options = parseEnvFileOption(process.argv.slice(2));
  if (!options.envFileExplicit) {
    console.error(EXPLICIT_ENV_FILE_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile(options.envFile);
  const confirm = resolveProcessConfirmation({
    processValue: process.env.STAGING_MIGRATE_DEPLOY_CONFIRM,
    cliConfirmed: options.confirmMigrateDeploy,
    expected: STAGING_MIGRATE_DEPLOY_CONFIRM,
  });
  const failures = [
    ...evaluateStagingOperatorGuards(env, {
      envFileExplicit: options.envFileExplicit,
    }).failures,
  ];
  if (confirm !== STAGING_MIGRATE_DEPLOY_CONFIRM) {
    failures.push({
      code: 'CONFIRM',
      message:
        'STAGING_MIGRATE_DEPLOY_CONFIRM must be the documented confirmation value',
    });
  }
  if (failures.length > 0) {
    const report = formatReadinessReport({ ok: false, failures });
    assertNoSecretLeak(report, env);
    console.error(report);
    process.exitCode = 1;
    return;
  }

  const command = dockerComposeOpsCommand({
    envFile: resolve(options.envFile),
    composeFile: resolve(COMPOSE_FILE),
    serviceArgs: ['prisma', 'migrate', 'deploy'],
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
    error instanceof Error ? error.message : 'Migration deploy failed.';
  console.error(message);
  process.exitCode = 1;
}
