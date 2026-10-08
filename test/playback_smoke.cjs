/**
 * 播放完整性运行时冒烟（PRD v1.2 硬验收 · fe 自检驱动，test-executor 可直接复用）
 *
 * 断言链（硬断言 = PRD v1.2 裁定四项）：
 *   1. 起播后 __HG_PLAYER_STATE__.hasVideo === true
 *   2. __HG_PLAYER_STATE__.videoWidth > 0
 *   3. __HG_PLAYER_STATE__.paused === false（播放中）
 *   4. player-rotate 横竖屏切换后 currentTime 连续（|Δ| ≤ 2s）
 * 扩展断言（播放不中断语义）：切换前后 paused 保持 false、playbackRate 保持设定值（1.25x）；
 * 横屏态 Esc 返回详情页；离开 Player 后 __HG_PLAYER_STATE__ 被清理。
 * hasAudio 为 best-effort 检测（手段见 Player.tsx detectHasAudio 注释），如实记入证据，
 * 检测 API 全缺失导致 false 时记 WARN 不计失败。
 *
 * 环境确定性：拦截数据层 /api/** 强制回落内置 mock —— mockPlay 奇数编号剧集（s1）为公共
 * HLS 测试流（test-streams.mux.dev，含音轨），零上游依赖、可离线复盘复跑。
 * 前置：pnpm build（驱动直接起 out/ 产物）。
 *
 * 证据落盘：test/evidence/playback/{playback_evidence.json,renderer_console.log,
 *           playback_portrait.png,playback_landscape.png,playback_after_esc.png}
 */
const fs = require('fs');
const path = require('path');
const { _electron } = require('/Users/xujin/agent-harness/playwright-skill/node_modules/playwright');

const ROOT = '/Users/xujin/projects/hongguo-desktop';
const EVD = path.join(ROOT, 'test', 'evidence', 'playback');
fs.mkdirSync(EVD, { recursive: true });

const checks = [];
let failed = false;
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failed = true;
}
function warn(name, detail) {
  checks.push({ name, ok: 'warn', detail });
  console.log(`WARN ${name} :: ${JSON.stringify(detail)}`);
}

(async () => {
  for (const f of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      console.error(`FATAL 缺少构建产物 ${f}，先执行 pnpm build`);
      process.exit(3);
    }
  }

  const app = await _electron.launch({
    args: ['.'],
    cwd: ROOT,
    executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${new Date().toISOString()}] console.${m.type()} ${m.text().slice(0, 400)}`));
  page.on('pageerror', (e) => consoleLines.push(`[${new Date().toISOString()}] PAGEERROR ${String(e).slice(0, 600)}`));

  // 拦截数据层 API（含探活）→ 网络层失败 → dataSource 确定性回落内置 mock
  await page.route('http://127.0.0.1:*/api/**', (route) => route.abort());
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);

  // 直达 Player：mock s1（奇数编号 → HLS 测试流，含音轨）
  await page.evaluate(() => { window.location.hash = '#/player/s1/1'; });

  // 等待起播并就绪（自动起播策略 no-user-gesture-required）
  await page.waitForFunction(
    () => {
      const s = window.__HG_PLAYER_STATE__;
      return s && s.hasVideo === true && s.paused === false;
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500); // 让 timeupdate 采样多走几拍，currentTime 明确 >0

  const readState = () => page.evaluate(() => window.__HG_PLAYER_STATE__ || null);
  const readRate = () => page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? v.playbackRate : -1;
  });
  const viewportInfo = () => page.evaluate(() => {
    const el = document.querySelector('.player-viewport');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { landscape: el.classList.contains('is-landscape'), width: r.width, height: r.height };
  });
  const poke = () => page.mouse.move(640, 400); // 唤出 3s 自动隐藏的控制层

  const evidence = { assertions: checks, samples: {}, notes: [] };

  /* ---- 硬断言 1/2/3：有画面 + 尺寸非 0 + 播放中 ---- */
  const s0 = await readState();
  evidence.samples.after_start = s0;
  check('起播后 hasVideo === true', s0 && s0.hasVideo === true, s0 && { videoWidth: s0.videoWidth, videoHeight: s0.videoHeight });
  check('videoWidth > 0', s0 && s0.videoWidth > 0, s0 && s0.videoWidth);
  check('paused === false（播放中）', s0 && s0.paused === false, s0 && { currentTime: s0.currentTime });
  if (s0 && s0.hasAudio === true) {
    check('hasAudio === true（音轨存在，best-effort）', true, { hasAudio: s0.hasAudio });
  } else {
    warn('hasAudio 检测', { value: s0 && s0.hasAudio, note: '检测 API 全部缺失或音频帧尚未解码；不计失败（手段见 detectHasAudio 注释）' });
  }

  /* ---- 倍速设为 1.25x（供切换后断言倍速保持） ---- */
  await poke();
  await page.getByTestId('player-rate').first().click({ timeout: 8000 });
  const rateSet = await readRate();
  check('倍速设定 1.25x 生效', rateSet === 1.25, rateSet);

  /* ---- 横屏切换：currentTime 连续（±2s）+ 布局横置 + 播放/倍速不中断 ---- */
  const t0 = (await readState()).currentTime;
  await poke();
  await page.getByTestId('player-rotate-fixed').first().click({ timeout: 8000 });
  await page.waitForTimeout(400);
  const s1 = await readState();
  const vp1 = await viewportInfo();
  evidence.samples.after_rotate_landscape = { state: s1, viewport: vp1, rate: await readRate() };
  check('横屏切换 currentTime 连续（|Δ| ≤ 2s）', Math.abs(s1.currentTime - t0) <= 2, { before: t0, after: s1.currentTime, delta: +(s1.currentTime - t0).toFixed(3) });
  check('横屏布局生效（is-landscape 且视口宽>高）', vp1 && vp1.landscape === true && vp1.width > vp1.height, vp1);
  check('横屏切换后仍在播放（paused === false）', s1.paused === false, s1.paused);
  check('横屏切换后倍速保持 1.25x', (await readRate()) === 1.25, await readRate());
  await page.screenshot({ path: path.join(EVD, 'playback_landscape.png') });

  /* ---- 切回竖屏：连续性与状态同样保持 ---- */
  const t1 = s1.currentTime;
  await poke();
  await page.getByTestId('player-rotate-fixed').first().click({ timeout: 8000 });
  await page.waitForTimeout(400);
  const s2 = await readState();
  const vp2 = await viewportInfo();
  evidence.samples.after_rotate_portrait = { state: s2, viewport: vp2 };
  check('竖屏切换 currentTime 连续（|Δ| ≤ 2s）', Math.abs(s2.currentTime - t1) <= 2, { before: t1, after: s2.currentTime, delta: +(s2.currentTime - t1).toFixed(3) });
  check('竖屏布局复原（无 is-landscape 且高>宽）', vp2 && vp2.landscape === false && vp2.height > vp2.width, vp2);
  await page.screenshot({ path: path.join(EVD, 'playback_portrait.png') });

  /* ---- 横屏态 Esc 返回详情（与 player-close 等价） ---- */
  await poke();
  await page.getByTestId('player-rotate-fixed').first().click({ timeout: 8000 });
  await page.waitForTimeout(300);
  const vp3 = await viewportInfo();
  check('再次进入横屏（Esc 前置）', vp3 && vp3.landscape === true, vp3);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => window.location.hash);
  check('横屏态 Esc 返回详情页', hash.startsWith('#/detail/'), hash);
  const stateAfterLeave = await readState();
  check('离开 Player 后 __HG_PLAYER_STATE__ 已清理', stateAfterLeave === null, stateAfterLeave);
  await page.screenshot({ path: path.join(EVD, 'playback_after_esc.png') });

  await app.close().catch(() => {});

  evidence.status = failed ? 'fail' : 'pass';
  evidence.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(EVD, 'renderer_console.log'), consoleLines.join('\n') + '\n');
  fs.writeFileSync(path.join(EVD, 'playback_evidence.json'), JSON.stringify(evidence, null, 1));
  console.log(`PLAYBACK_SMOKE ${evidence.status.toUpperCase()} (${checks.filter((c) => c.ok === true).length}/${checks.length} pass)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('PLAYBACK_SMOKE_FATAL:', e && e.message ? e.message : e);
  try { fs.writeFileSync(path.join(EVD, 'playback_evidence.json'), JSON.stringify({ status: 'fatal', error: String(e), assertions: checks }, null, 1)); } catch {}
  process.exit(3);
});
