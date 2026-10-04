import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webRoot = resolve(root, 'apps/web');

execFileSync(
  process.execPath,
  ['../../tooling/next-cli.mjs', 'build', '--webpack'],
  {
    cwd: webRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

const child = spawn(
  process.execPath,
  ['../../tooling/next-cli.mjs', 'start', '--port', '3100'],
  {
    cwd: webRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
