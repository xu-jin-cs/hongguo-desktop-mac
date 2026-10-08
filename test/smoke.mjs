#!/usr/bin/env node
/**
 * 构建冒烟（fe 自检用）：验证 pnpm build 产物齐全 + 关键 data-testid 在渲染层源码全注入。
 * 完整整合白盒冒烟（前端交互→后端分支）在 pm_quality_gate/test_lead 阶段执行（PRD §9 v1.1）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
let failed = false;

function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}

for (const f of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
  check(`构建产物存在: ${f}`, existsSync(join(root, f)));
}

const TESTIDS = [
  'nav-home', 'nav-category', 'nav-rank', 'nav-search', 'nav-library',
  'search-input', 'search-submit', 'series-card', 'ep-btn', 'fav-btn',
  'player-core', 'player-prev', 'player-next', 'player-rate', 'player-progress', 'player-close',
  'player-rotate-fixed',
  'player-fullscreen',
  'retry-btn', 'history-item',
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

const src = walk(join(root, 'src/renderer'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

for (const id of TESTIDS) {
  check(`data-testid 注入: ${id}`, src.includes(`data-testid="${id}"`) || src.includes(`data-testid='${id}'`));
}

/* PRD v1.2 播放完整性（静态链路检查；运行时断言走 test/playback_smoke.cjs） */
check('播放运行态暴露: __HG_PLAYER_STATE__', src.includes('__HG_PLAYER_STATE__'));
check('Esc 返回接线: Escape keydown', src.includes("'Escape'") || src.includes('"Escape"'));
const playerCss = readFileSync(join(root, 'src/renderer/src/styles/app.css'), 'utf8');
check('字幕口径: player video object-fit=contain（不裁切烧录字幕区）',
  /\.player-viewport video\s*\{[^}]*object-fit:\s*contain/.test(playerCss));
check('横屏布局: is-landscape 16:9 规则', playerCss.includes('.player-viewport.is-landscape'));

process.exit(failed ? 1 : 0);
