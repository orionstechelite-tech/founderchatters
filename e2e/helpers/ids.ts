import { randomBytes } from 'node:crypto';

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

export function e2eEmail(label: string): string {
  return `${label}.${uniqueSuffix()}@example.com`;
}

export function e2eName(label: string): string {
  return `E2E ${label} ${uniqueSuffix().slice(0, 8)}`;
}
