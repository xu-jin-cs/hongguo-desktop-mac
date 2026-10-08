#!/usr/bin/env node
// 保证 vitest 用的 Node ABI better-sqlite3 副本在位（Electron ABI 与 Node ABI 不可共存于同一 node_modules）
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test/vendor-node');
const target = path.join(dir, 'node_modules/better-sqlite3');
if (!existsSync(target)) {
  console.log('[ensure-test-native] installing Node-ABI better-sqlite3 for vitest...');
  execSync('npm i better-sqlite3@12.11.1 --no-audit --no-fund', { cwd: dir, stdio: 'inherit' });
}
