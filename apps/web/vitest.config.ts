import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    // Member-shell tests stub `fetch` in jsdom. Parallel files contend on
    // worker globals and produce stuck Loading states. Serialize files.
    fileParallelism: false,
  },
});
