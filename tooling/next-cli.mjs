import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

if (process.platform === 'win32') {
  try {
    require('@next/swc-win32-x64-msvc');
  } catch {
    const wasmEntry = require.resolve('@next/swc-wasm-nodejs/wasm.js');

    process.env.NEXT_TEST_WASM_DIR = path.dirname(wasmEntry);
    console.warn(
      'Native Next.js SWC is unavailable; using the matching official WASM compiler.',
    );
  }
}

await import('next/dist/bin/next');
