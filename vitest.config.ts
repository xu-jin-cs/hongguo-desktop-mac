import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// better-sqlite3 原生模块 ABI 双轨：运行/打包用 Electron ABI（electron-rebuild / electron-builder），
// vitest 跑在 Node 上，须指向 Node ABI 副本（test/vendor-node，由 scripts/ensure-test-native.mjs 保障）
export default defineConfig({
  resolve: {
    alias: {
      'better-sqlite3': path.resolve(root, 'test/vendor-node/node_modules/better-sqlite3'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
