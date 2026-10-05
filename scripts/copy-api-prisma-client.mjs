import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'generated/prisma');
const destination = resolve(root, 'apps/api/dist/generated/prisma');

if (!existsSync(source)) {
  throw new Error('generated/prisma is missing; run prisma generate first');
}

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });
