import { describe, expect, it } from 'vitest';

import {
  isTombstoneEmail,
  newTombstoneEmail,
} from '../src/identity/deleted-founder.js';

describe('deleted founder tombstone email', () => {
  it('generates distinct non-PII deleted.invalid addresses', () => {
    const first = newTombstoneEmail();
    const second = newTombstoneEmail();

    expect(first).toMatch(/^deleted-[a-f0-9]{32}@deleted\.invalid$/);
    expect(second).toMatch(/^deleted-[a-f0-9]{32}@deleted\.invalid$/);
    expect(first).not.toBe(second);
    expect(isTombstoneEmail(first)).toBe(true);
    expect(isTombstoneEmail('founder@example.com')).toBe(false);
  });
});
