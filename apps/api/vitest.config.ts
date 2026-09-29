import { defineConfig } from 'vitest/config';

// Parallel Nest integration files share one Postgres. Default 10s hook / 5s
// test timeouts fail AppModule bootstrap under that load. These are test-only
// and do not change application runtime. Do not skip tests to hide hangs.
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 15_000,
    // Integration files share one Postgres/Redis. Parallel Nest apps contend
    // on taxonomy rows and connection pools; serialize files instead of
    // force-exiting or inflating timeouts.
    fileParallelism: false,
  },
});
