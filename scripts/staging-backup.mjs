import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';

import {
  parseEnvFile,
  parseEnvFileOption,
  resolveProcessConfirmation,
} from './staging-env.mjs';
import {
  COMPOSE_FILE,
  EXPLICIT_ENV_FILE_MESSAGE,
  STAGING_BACKUP_CONFIRM,
  assertNoSecretLeak,
  backupArtifactNames,
  backupTimestamp,
  dockerComposeBackupDumpCommand,
  dockerComposeBackupListCommand,
  evaluateBackupArtifactCollision,
  evaluateBackupCleanup,
  evaluateBackupGuards,
  evaluatePgRestoreList,
  evaluateStreamedDumpResult,
  formatReadinessReport,
} from './staging-readiness.mjs';

function removeIfPresent(filePath) {
  try {
    unlinkSync(filePath);
  } catch {
    // The partial file may not exist yet.
  }
}

function spawnCaptured(command, args, { inputStream } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: [inputStream ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });
    child.on('error', rejectPromise);
    if (inputStream) {
      inputStream.pipe(child.stdin);
      inputStream.on('error', rejectPromise);
    }
    child.on('close', (code) => {
      resolvePromise({
        status: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

export function streamChildStdoutToFd(command, args, fd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(null, { fd, autoClose: false });
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrChunks = [];
    let bytesWritten = 0;
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });
    child.stdout.on('data', (chunk) => {
      bytesWritten += chunk.length;
    });
    child.stdout.pipe(output);
    child.on('error', rejectPromise);
    output.on('error', rejectPromise);
    child.on('close', (code) => {
      finished(output)
        .catch(() => undefined)
        .finally(() => {
          resolvePromise({
            status: code ?? 1,
            bytesWritten,
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
          });
        });
    });
  });
}

export function openExclusiveBackupFile(filePath) {
  return openSync(filePath, 'wx', 0o600);
}

async function main() {
  process.umask(0o077);
  const options = parseEnvFileOption(process.argv.slice(2));
  if (!options.envFileExplicit) {
    console.error(EXPLICIT_ENV_FILE_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile(options.envFile);
  const confirm = resolveProcessConfirmation({
    processValue: process.env.STAGING_BACKUP_CONFIRM,
    cliConfirmed: options.confirmBackup,
    expected: STAGING_BACKUP_CONFIRM,
  });
  const guards = evaluateBackupGuards({
    nodeEnv: env.NODE_ENV,
    confirm,
    backupDir: env.STAGING_BACKUP_DIR,
    envFile: options.envFile,
    envFileExplicit: options.envFileExplicit,
    postgresUser: env.POSTGRES_USER,
    postgresDb: env.POSTGRES_DB,
  });
  if (!guards.ok) {
    const report = formatReadinessReport(guards);
    assertNoSecretLeak(report, env);
    console.error(report);
    process.exitCode = 1;
    return;
  }

  mkdirSync(env.STAGING_BACKUP_DIR, { recursive: true, mode: 0o700 });
  const { finalName, partialName } = backupArtifactNames(backupTimestamp());
  const finalPath = join(env.STAGING_BACKUP_DIR, finalName);
  const tempPath = join(env.STAGING_BACKUP_DIR, partialName);
  const collision = evaluateBackupArtifactCollision({
    finalExists: existsSync(finalPath),
    partialExists: existsSync(tempPath),
  });
  if (!collision.ok) {
    console.error(collision.message);
    process.exitCode = 1;
    return;
  }

  let createdPartial = false;
  let finalized = false;
  let fd;
  try {
    fd = openExclusiveBackupFile(tempPath);
    createdPartial = true;
    chmodSync(tempPath, 0o600);

    const dump = dockerComposeBackupDumpCommand({
      envFile: resolve(options.envFile),
      composeFile: resolve(COMPOSE_FILE),
      postgresUser: env.POSTGRES_USER,
      postgresDb: env.POSTGRES_DB,
    });
    const dumpResult = await streamChildStdoutToFd(dump.command, dump.args, fd);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    assertNoSecretLeak(dumpResult.stderr, env);
    const dumpVerdict = evaluateStreamedDumpResult({
      exitCode: dumpResult.status,
      bytesWritten: dumpResult.bytesWritten,
    });
    if (!dumpVerdict.ok) {
      console.error(dumpVerdict.message);
      process.exitCode = 1;
      return;
    }

    const list = dockerComposeBackupListCommand({
      envFile: resolve(options.envFile),
      composeFile: resolve(COMPOSE_FILE),
    });
    const listResult = await spawnCaptured(list.command, list.args, {
      inputStream: createReadStream(tempPath),
    });
    assertNoSecretLeak(`${listResult.stdout}${listResult.stderr}`, env);
    const listing = evaluatePgRestoreList(listResult.stdout);
    if (listResult.status !== 0 || !listing.ok) {
      console.error('Backup integrity verification failed.');
      process.exitCode = 1;
      return;
    }

    renameSync(tempPath, finalPath);
    chmodSync(finalPath, 0o600);
    finalized = true;
    console.log(
      `Backup wrote a verified custom-format dump. Copy ${finalName} off-server before migrate deploy.`,
    );
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // The dump stream may already have finished.
      }
    }
    const cleanup = evaluateBackupCleanup({ createdPartial, finalized });
    if (cleanup.deletePartial) {
      removeIfPresent(tempPath);
    }
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Staging backup failed.';
  console.error(message);
  process.exitCode = 1;
}
