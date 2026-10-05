import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const VALIDATION_ENV_FILE = resolve(
  'deploy/staging/.env.staging.validation',
);

const KNOWN_FLAGS = new Set([
  '--env-file',
  '--skip-docker',
  '--validation',
  '--live',
  '--confirm-backup',
  '--confirm-migrate-deploy',
]);

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Environment file is missing`);
  }
  const env = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function parseEnvFileOption(argv) {
  const options = {
    envFile: '',
    envFileExplicit: false,
    skipDocker: false,
    mode: undefined,
    confirmBackup: false,
    confirmMigrateDeploy: false,
    unknownFlags: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--env-file') {
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        options.envFile = resolve(next);
        options.envFileExplicit = true;
        index += 1;
      }
    } else if (argument === '--skip-docker') {
      options.skipDocker = true;
    } else if (argument === '--validation') {
      options.mode = 'validation';
    } else if (argument === '--live') {
      options.mode = 'live';
    } else if (argument === '--confirm-backup') {
      options.confirmBackup = true;
    } else if (argument === '--confirm-migrate-deploy') {
      options.confirmMigrateDeploy = true;
    } else if (argument.startsWith('--') && !KNOWN_FLAGS.has(argument)) {
      options.unknownFlags.push(argument);
    }
  }
  return options;
}

export function resolveProcessConfirmation({
  processValue,
  cliConfirmed = false,
  expected,
}) {
  if (cliConfirmed) {
    return expected;
  }
  return processValue == null ? '' : String(processValue);
}

export function resolvePreflightEnvFile(options) {
  if (options.envFileExplicit) {
    return { ok: true, envFile: options.envFile, envFileExplicit: true };
  }
  if (options.mode === 'validation') {
    return {
      ok: true,
      envFile: VALIDATION_ENV_FILE,
      envFileExplicit: false,
    };
  }
  return { ok: false, envFile: '', envFileExplicit: false };
}
