import { createClient } from 'redis';

import { e2eEnv } from '../env.js';
import { assertE2eSafety } from './safety.js';

const RATE_LIMIT_PREFIXES = ['auth-rate:v1:*'] as const;

export async function clearE2eRateLimitKeys(): Promise<void> {
  assertE2eSafety();
  const client = createClient({ url: e2eEnv().REDIS_URL });
  await client.connect();
  try {
    const keys: string[] = [];
    for (const pattern of RATE_LIMIT_PREFIXES) {
      const found = await client.keys(pattern);
      keys.push(...found.filter((key) => key.length > 0));
    }
    const unique = [...new Set(keys)];
    if (unique[0]) {
      await client.del(unique[0], ...unique.slice(1));
    }
  } finally {
    await client.quit();
  }
}
