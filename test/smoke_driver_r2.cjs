/**
 * hongguo-desktop 冒烟执行驱动 r2（test-executor · 批次 GB-HG-WB-20261006-001 · round 2 精准回归）
 * 范围：仅回归 round1 失败的 4 条 TC-HG-004/005/006/007（D1 CSP 拦片源 / D2 收藏缺 score 白屏，
 * 修复提交 8e17019）。纪律同 round1：单 Electron 实例、同 case_id 单执行（仅 env_flake 允许重试 1 次）、
 * 证据全新采集不复用 r1。
 * 与 r1 驱动差异（round2 用户裁定断言口径）：
 *   1. TC-HG-004 追加 __HG_PLAYER_STATE__ 机械断言：hasVideo===true 且 currentTime>0 前进（真实片源）。
 *   2. TC-HG-005 收藏后 Library 断言卡片标题+评分可见、该用例窗口内 console 零 PAGEERROR；
 *      steps 末步 assert_text「暂无内容」与实现不符（实现空态文案为「暂无收藏」，EmptyView text 覆盖），
 *      按用户裁定语义「取消收藏→列表移除」执行：断言 series-card 消失 + body 命中 /暂无(收藏|内容)/（deviation 记录）。
 *   3. TC-HG-006 历史行点击落点按用户裁定取「续播」按钮（.history-resume，与行点击同一 resume 处理器），
 *      并追加断言：续播 URL ep 与 history 顶行 ep 一致。
 *   4. TC-HG-007 在 steps 之外追加「切 tab」：切至漫剧 tab 断言栅格重渲染 + 对应后端佐证。
 *   5. detailId 改为步进钩子在 #/detail/<id> hash 出现时即时捕获（r2 不执行 TC-HG-003）。
 * 环境前置：执行前已清理 r1 残留（favorites 1 条 / history progress_sec=0，sqlite3 CLI DELETE，
 * 应用未运行态的环境准备；user_version=1 → 本次启动真实走 D2 的 v2 迁移加列）。
 */
const fs = require('fs');
const path = require('path');
const { _electron } = require('/Users/xujin/agent-harness/playwright-skill/node_modules/playwright');

const ROOT = '/Users/xujin/projects/hongguo-desktop';
const EVD = path.join(ROOT, 'test', 'evidence', 'smoke', 'r2');
const SHOTS = path.join(EVD, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const R2_CASES = ['TC-HG-004', 'TC-HG-005', 'TC-HG-006', 'TC-HG-007'];

const auditLines = [];
function audit(line) {
  auditLines.push(`[${new Date().toISOString()}] ${line}`);
}

const details = [];
let PORT = 0;
let netSink = null;
const netLogAll = [];
// 全局 console 流水（PAGEERROR 按用例窗口归集）
const consoleLines = [];
let consoleMark = 0;

async function apiGet(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function shot(page, caseId) {
  const p1 = path.join(EVD, `${caseId}.png`);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, path.join(SHOTS, `${caseId}.png`));
  return `test/evidence/smoke/r2/${caseId}.png`;
}

function pageErrorsSince(mark) {
  return consoleLines.slice(mark).filter((l) => l.includes('PAGEERROR'));
}

async function runSteps(page, tc, detailId) {
  const stepLog = [];
  for (const [i, s] of tc.steps.entries()) {
    const desc = `step${i + 1} ${s.action} ${s.target || ''} ${s.value || s.expected_value || ''}`.trim();
    if (s.action === 'goto') {
      await page.evaluate((h) => { window.location.hash = h; }, s.target);
      await page.waitForTimeout(300);
    } else if (s.action === 'click') {
      if (s.target === 'series-card') {
        // 同 r1：点卡片标题区（封面重试浮层 stopPropagation，点卡体等效真实用户打开详情）
        await page.getByTestId('series-card').first().locator('.card-title').click({ timeout: 10000 });
      } else if (tc.case_id === 'TC-HG-006' && s.target === 'history-item') {
        // round2 用户裁定：历史行点「续播」按钮（与行点击同一 resume 处理器）
        await page.getByTestId('history-item').first().locator('.history-resume').click({ timeout: 10000 });
        tc.__resumeBtn = true;
      } else {
        await page.getByTestId(s.target).first().click({ timeout: 10000 });
      }
      if (tc.case_id === 'TC-HG-006' && s.target === 'nav-library') {
        // 同 r1 deviation：steps 序列化遗漏「历史」tab 切换，按 ui_trigger 补点
        await page.locator('.tab-bar button', { hasText: '历史' }).click({ timeout: 8000 });
        tc.__tabPatched = true;
      }
    } else if (s.action === 'input') {
      await page.getByTestId(s.target).first().fill(s.value, { timeout: 10000 });
    } else if (s.action === 'wait') {
      await page.waitForTimeout(Number(s.value));
    } else if (s.action === 'assert_visible') {
      if (s.target.startsWith('player')) await page.mouse.move(640, 400);
      await page.getByTestId(s.target).first().waitFor({ state: 'visible', timeout: 12000 });
    } else if (s.action === 'assert_url') {
      const hash = await page.evaluate(() => window.location.hash);
      if (!hash.startsWith(s.expected_value)) {
        throw new Error(`assert_url FAIL: hash=${hash} expected prefix=${s.expected_value}`);
      }
    } else if (s.action === 'assert_text') {
      const text = await page.evaluate(() => document.body.innerText);
      if (tc.case_id === 'TC-HG-005' && s.expected_value === '暂无内容') {
        // deviation：实现空态文案为「暂无收藏」（EmptyView text 覆盖默认「暂无内容」）；
        // 按 round2 用户裁定语义「取消收藏→列表移除」断言空态命中 /暂无(收藏|内容)/
        if (!/暂无(收藏|内容)/.test(text)) {
          const snippet = text.replace(/\s+/g, ' ').slice(0, 300);
          throw new Error(`assert_text FAIL: body 不含「暂无收藏/暂无内容」；body 前300字符: ${snippet}`);
        }
        tc.__emptyTextPatched = true;
      } else if (!text.includes(s.expected_value)) {
        const snippet = text.replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`assert_text FAIL: body 不含「${s.expected_value}」；body 前300字符: ${snippet}`);
      }
    } else {
      throw new Error(`unknown action: ${s.action}`);
    }
    stepLog.push(`OK ${desc}`);
    // 步进钩子：#/detail/<id> hash 出现时即时捕获 detailId（r2 不执行 TC-HG-003）
    const h = await page.evaluate(() => window.location.hash).catch(() => '');
    const dm = h.match(/#\/detail\/([^/]+)/);
    if (dm) detailId.id = decodeURIComponent(dm[1]);
    // TC-HG-005 步中钩子：Library 收藏卡片渲染质量断言（标题+评分可见，步骤9 assert_visible 之后）
    if (tc.case_id === 'TC-HG-005' && i === 8) {
      const card = page.getByTestId('series-card').first();
      const title = (await card.locator('.card-title').innerText()).trim();
      const score = (await card.locator('.meta-score').innerText()).trim();
      if (!title) throw new Error('TC-HG-005 收藏卡片标题为空');
      if (!/^(\d+\.\d|—)$/.test(score)) throw new Error(`TC-HG-005 收藏卡片评分渲染异常: 「${score}」`);
      tc.__favCard = { title, score };
      stepLog.push(`OK step9+ 收藏卡片标题「${title}」评分「${score}」渲染正常`);
    }
  }
  return stepLog;
}

async function videoTime(page) {
  return page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : -1;
  });
}

async function playerState(page) {
  return page.evaluate(() => (window.__HG_PLAYER_STATE__ ? { ...window.__HG_PLAYER_STATE__ } : null));
}

/** 后端佐证采集（数据层直连只读 GET）。strict=true 时佐证断言失败抛错（计入用例失败）；false 仅尽力采集。 */
async function probeBackend(tc, page, detailId, strict) {
  const must = (cond, msg) => { if (!cond && strict) throw new Error(msg); };
  if (tc.case_id === 'TC-HG-004') {
    const hash = await page.evaluate(() => window.location.hash);
    const m = hash.match(/#\/player\/([^/]+)\/(\d+)/);
    const sid = m ? decodeURIComponent(m[1]) : detailId.id;
    const ep = m ? Number(m[2]) : 1;
    if (sid) detailId.id = sid;
    const r = await apiGet(`/api/play?series_id=${encodeURIComponent(sid)}&ep=${ep}`);
    const ps1 = await playerState(page);
    const t1 = ps1 ? ps1.currentTime : await videoTime(page);
    await page.waitForTimeout(2000);
    const ps2 = await playerState(page);
    const t2 = ps2 ? ps2.currentTime : await videoTime(page);
    const bodyText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200);
    must(r.body?.code === 0 && r.body?.data?.play_url, `backend /api/play 佐证失败 code=${r.body?.code} play_url=${r.body?.data?.play_url}`);
    // round2 裁定断言：__HG_PLAYER_STATE__.hasVideo===true 且 currentTime>0 前进（真实片源可播，CSP 已放行）
    must(Boolean(ps2), '__HG_PLAYER_STATE__ 不存在（Player 未进入播放采样态）');
    must(ps2 && ps2.hasVideo === true, `__HG_PLAYER_STATE__.hasVideo!==true: ${JSON.stringify(ps2)}；页面文案: ${bodyText}`);
    must(t2 > 0 && t2 > t1, `起播失败：currentTime 未前进 (${t1} -> ${t2})；页面文案: ${bodyText}`);
    return { endpoint: `GET /api/play?series_id=${sid}&ep=${ep}`, series_id: sid, ep, status: r.status, code: r.body?.code, play_url: r.body?.data?.play_url ? String(r.body.data.play_url).slice(0, 120) : null, prev_ep: r.body?.data?.prev_ep ?? null, next_ep: r.body?.data?.next_ep ?? null, player_state_t1: ps1, player_state_t2: ps2, currentTime_advancing: t2 > t1, page_text: bodyText };
  }
  if (tc.case_id === 'TC-HG-005') {
    const sid = detailId.id;
    const r = await apiGet('/api/favorites');
    const contains = Boolean(r.body?.data?.list?.some((x) => x.series_id === sid));
    must(r.body?.code === 0, 'backend /api/favorites GET 佐证失败');
    must(!contains, '取消收藏后 /api/favorites 仍含该 series_id（store DELETE 分支未生效）');
    // round2 裁定断言：本用例窗口内 console 零 PAGEERROR（D2 白屏崩溃不复发）
    const pes = pageErrorsSince(consoleMark);
    must(pes.length === 0, `TC-HG-005 窗口内出现 PAGEERROR（D2 白屏未根治）: ${pes[0] || ''}`);
    return { endpoint: 'GET /api/favorites（终态）', series_id: sid, status: r.status, code: r.body?.code, final_list_len: r.body?.data?.list?.length, contains_after_remove: contains, list_ids: r.body?.data?.list?.map((x) => x.series_id), fav_card_render: tc.__favCard || null, pageerror_in_window: pes.length };
  }
  if (tc.case_id === 'TC-HG-006') {
    const sid = detailId.id;
    const r = await apiGet('/api/history');
    const top = r.body?.data?.list?.[0];
    const resumeCur = await videoTime(page);
    must(r.body?.code === 0, 'backend /api/history 佐证失败');
    must(top && top.series_id === sid && top.progress_sec > 0, `history 落库佐证失败: top=${JSON.stringify(top)}`);
    // round2 裁定断言：续播进 Player 且 ep 与历史一致
    const hash = await page.evaluate(() => window.location.hash);
    const hm = hash.match(/#\/player\/([^/]+)\/(\d+)/);
    must(Boolean(hm), `续播后未进 Player: hash=${hash}`);
    if (hm) {
      must(decodeURIComponent(hm[1]) === sid, `续播 series 不一致: url=${decodeURIComponent(hm[1])} history=${sid}`);
      must(Number(hm[2]) === top.ep, `续播 ep 不一致: url ep=${hm[2]} history ep=${top.ep}`);
    }
    return { endpoint: 'GET /api/history', series_id: sid, status: r.status, code: r.body?.code, top_series_id: top?.series_id, top_ep: top?.ep, top_progress_sec: top?.progress_sec, list_len: r.body?.data?.list?.length, resume_url: hash, resume_ep_match: hm ? Number(hm[2]) === top?.ep : false, resume_currentTime: resumeCur, resume_diff_sec: top ? Math.abs(resumeCur - top.progress_sec) : null };
  }
  if (tc.case_id === 'TC-HG-007') {
    const r = await apiGet('/api/category?type=real&page=1&size=20');
    must(r.body?.code === 0 && Array.isArray(r.body?.data?.list), 'backend /api/category 佐证失败');
    return { endpoint: 'GET /api/category?type=real&page=1&size=20', status: r.status, code: r.body?.code, list_is_array: Array.isArray(r.body?.data?.list), list_len: r.body?.data?.list?.length };
  }
  return null;
}

/** 环境波动判定：仅真实上游 502/504/网络超时才标 env_flake（允许同用例最多重试 1 次）。 */
function isEnvFlake(rec) {
  const s = `${rec.error || ''} ${JSON.stringify(rec.backend_evidence || {})}`;
  return /(^|[^0-9])(502|504)([^0-9]|$)|upstream.*timeout|fetch.*timed out|ETIMEDOUT|ECONNRESET/i.test(s)
    && !/片源异常|CSP|Content Security/i.test(s);
}

(async () => {
  const t0 = Date.now();
  const el = JSON.parse(fs.readFileSync(path.join(ROOT, 'execution-list.json'), 'utf8'));
  const cases = el.cases.filter((c) => R2_CASES.includes(c.case_id));
  if (cases.length !== 4) throw new Error(`r2 cases != 4: ${cases.length}`);

  audit('browser_launch=1 electron_single_instance playwright__electron.launch args=[.] round=2');
  const app = await _electron.launch({
    args: ['.'],
    cwd: ROOT,
    executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
  });
  const mainLogStream = fs.createWriteStream(path.join(EVD, 'main_process.log'));
  app.process().stdout.on('data', (d) => mainLogStream.write(d));
  app.process().stderr.on('data', (d) => mainLogStream.write(d));
  app.process().on('exit', (code, signal) => {
    audit(`APP_PROCESS_EXIT code=${code} signal=${signal}`);
    mainLogStream.write(`\n[driver] app process exited code=${code} signal=${signal}\n`);
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  page.on('console', (m) => consoleLines.push(`[${new Date().toISOString()}] console.${m.type()} ${m.text().slice(0, 400)}`));
  page.on('pageerror', (e) => consoleLines.push(`[${new Date().toISOString()}] PAGEERROR ${String(e).slice(0, 600)}`));
  page.on('request', (req) => {
    const u = req.url();
    if (!/^http:\/\/127\.0\.0\.1:\d+\/api\//.test(u)) return;
    netLogAll.push({ ts: new Date().toISOString(), method: req.method(), url: u.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''), case_id: netSink });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (!/^http:\/\/127\.0\.0\.1:\d+\/api\//.test(u)) return;
    const short = u.replace(/^http:\/\/127\.0\.0\.1:\d+/, '');
    const entry = [...netLogAll].reverse().find((e) => e.url === short && e.status === undefined);
    res.json().then((body) => {
      const rec = entry || { ts: new Date().toISOString(), method: res.request().method(), url: short, case_id: netSink };
      rec.status = res.status();
      rec.env_code = body && typeof body === 'object' ? body.code : undefined;
      if (!entry) netLogAll.push(rec);
    }).catch(() => {
      if (entry) entry.status = res.status();
    });
  });
  await page.waitForTimeout(2500);

  PORT = await page.evaluate(() => window.__HG_PORT__ || 0);
  const portFile = Number(fs.readFileSync(path.join(ROOT, '.hg-port'), 'utf8').trim());
  const probe = await apiGet('/api/home?page=1&size=1').catch((e) => ({ status: -1, body: null, err: String(e) }));
  audit(`real_integration_check __HG_PORT__=${PORT} port_file=${portFile} probe_status=${probe.status} probe_code=${probe.body?.code}`);
  if (!(PORT > 0)) throw new Error('window.__HG_PORT__ 注入失败（=0），非真实集成，终止执行');
  if (portFile !== PORT) throw new Error(`.hg-port(${portFile}) != __HG_PORT__(${PORT})，端口不一致，终止执行`);
  if (probe.status === -1) throw new Error('数据层 127.0.0.1 不可达，终止执行');

  const detailId = { id: null };

  async function runCase(tc) {
    const rec = { case_id: tc.case_id, verdict: 'fail', evidence: null, steps_log: [], backend_evidence: null, backend_hit: [], notes: [] };
    const tStart = Date.now();
    netSink = tc.case_id;
    consoleMark = consoleLines.length;
    try {
      rec.steps_log = await runSteps(page, tc, detailId);
      // TC-HG-007 round2 追加：切 tab（漫剧）栅格重渲染断言
      if (tc.case_id === 'TC-HG-007') {
        await page.locator('.tab-bar button', { hasText: '漫剧' }).click({ timeout: 8000 });
        await page.waitForTimeout(2500);
        await page.getByTestId('series-card').first().waitFor({ state: 'visible', timeout: 12000 });
        const gridCount = await page.getByTestId('series-card').count();
        if (!(gridCount > 0)) throw new Error('TC-HG-007 切 tab(漫剧) 后栅格无卡片');
        const rc = await apiGet('/api/category?type=comic&page=1&size=20');
        if (!(rc.body?.code === 0 && Array.isArray(rc.body?.data?.list))) {
          throw new Error(`TC-HG-007 漫剧 tab 后端佐证失败 code=${rc.body?.code}`);
        }
        rec.steps_log.push(`OK tab-switch 漫剧 栅格重渲染 cards=${gridCount} backend_code=${rc.body?.code} list_len=${rc.body?.data?.list?.length}`);
        tc.__tabSwitch = { tab: 'comic', cards: gridCount, backend_code: rc.body?.code, list_len: rc.body?.data?.list?.length };
      }
      rec.backend_evidence = await probeBackend(tc, page, detailId, true);
      if (tc.__tabSwitch) rec.backend_evidence = { ...rec.backend_evidence, tab_switch: tc.__tabSwitch };
      rec.verdict = 'pass';
    } catch (err) {
      rec.verdict = 'fail';
      rec.error = String(err && err.message ? err.message : err).slice(0, 600);
      try { rec.backend_evidence = await probeBackend(tc, page, detailId, false); } catch (e2) { rec.notes.push(`backend probe(非严格) 异常: ${String(e2 && e2.message || e2).slice(0, 200)}`); }
      try {
        rec.error_context = {
          hash: await page.evaluate(() => window.location.hash),
          body_text: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300),
        };
      } catch (e3) { rec.notes.push(`error_context 采集失败: ${String(e3 && e3.message || e3).slice(0, 200)}`); }
    }
    netSink = null;
    rec.pageerror_in_window = pageErrorsSince(consoleMark).length;
    const hits = netLogAll.filter((e) => e.case_id === tc.case_id)
      .map((e) => `${e.method} ${e.url}${e.status !== undefined ? ` -> ${e.status}${e.env_code !== undefined ? `/code=${e.env_code}` : ''}` : ''}`);
    rec.backend_hit = [...new Set(hits)];
    if (rec.backend_evidence?.endpoint) rec.backend_hit.push(`probe: ${rec.backend_evidence.endpoint}`);
    if (tc.__tabPatched) rec.notes.push('deviation: 按 ui_trigger 补「历史」tab 点击（steps 序列化遗漏 tab 切换；用例语义不变，同 r1）');
    if (tc.__resumeBtn) rec.notes.push('deviation: history-item 点击落点按 round2 用户裁定取「续播」按钮（.history-resume，与行点击同一 resume 处理器）');
    if (tc.__emptyTextPatched) rec.notes.push('deviation: 末步 assert_text「暂无内容」与实现空态文案「暂无收藏」不符，按 round2 裁定语义「列表移除」断言 /暂无(收藏|内容)/');
    rec.elapsed_ms = Date.now() - tStart;
    try { rec.evidence = await shot(page, tc.case_id); } catch (e) { rec.notes.push(`screenshot failed: ${e.message}`); }
    return rec;
  }

  for (const tc of cases) {
    let rec = await runCase(tc);
    if (rec.verdict === 'fail' && isEnvFlake(rec)) {
      audit(`env_flake_detected ${tc.case_id} retry_once`);
      rec.notes.push('env_flake=true: 真实上游 502/504/超时，按规约重试 1 次');
      const retry = await runCase(tc);
      retry.notes = [...rec.notes, `首次尝试失败(环境波动): ${(rec.error || '').slice(0, 200)}`, ...retry.notes];
      retry.retried = true;
      rec = retry;
    }
    audit(`executed ${tc.case_id} verdict=${rec.verdict} evidence=${tc.caseId || tc.case_id}.png backend_hit=${rec.backend_hit.length} pageerror=${rec.pageerror_in_window}`);
    details.push(rec);
  }

  await app.close().catch(() => {});
  audit(`batch_finished elapsed_ms=${Date.now() - t0}`);
  fs.writeFileSync(path.join(EVD, 'renderer_console.log'), consoleLines.join('\n') + '\n');
  fs.writeFileSync(path.join(EVD, 'renderer_api.log'), netLogAll.map((e) => JSON.stringify(e)).join('\n') + '\n');
  mainLogStream.end();

  // ---- r2 manifest / audit / tracker ----
  const r2Passed = details.filter((d) => d.verdict === 'pass').length;
  const manifest = {
    global_batch_id: 'GB-HG-WB-20261006-001',
    round: 2,
    scope: '精准回归：仅 round1 失败的 TC-HG-004/005/006/007',
    screenshots_taken: details.filter((d) => d.evidence).length,
    total_steps: cases.reduce((n, c) => n + c.steps.length, 0),
    cases: details.map((d) => ({ case_id: d.case_id, verdict: d.verdict, screenshot: d.evidence })),
    started_at: new Date(t0).toISOString(),
    finished_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(EVD, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(EVD, 'audit.log'), auditLines.join('\n') + '\n');
  const tracker = {
    global_batch_id: 'GB-HG-WB-20261006-001',
    round: 2,
    browser_launch_count: 1,
    max_browser_launch: 1,
    executed_cases: details.map((d) => d.case_id),
    violations: [],
  };
  fs.writeFileSync(path.join(EVD, 'exec_tracker.json'), JSON.stringify(tracker, null, 1));
  const bm = JSON.parse(fs.readFileSync(path.join(ROOT, 'batch_meta.json'), 'utf8'));
  bm.batch_id = bm.global_batch_id;
  fs.writeFileSync(path.join(EVD, 'batch_meta.json'), JSON.stringify(bm, null, 1));

  // ---- smoke_test_report.json：round=2，保留 r1 摘要，合并 pass_rate（r1 已过 3 条 + 本轮 4 条）----
  const r1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'smoke_test_report.json'), 'utf8'));
  const r1Verdicts = Object.fromEntries((r1.details || []).map((d) => [d.case_id, d.verdict]));
  const r1PassedCount = Object.values(r1Verdicts).filter((v) => v === 'pass').length;
  const mergedPassed = r1PassedCount + r2Passed;
  const mergedTotal = 7;
  const mergedRate = Number((mergedPassed / mergedTotal).toFixed(4));
  const r2FailedModules = [...new Set(details.filter((d) => d.verdict !== 'pass').flatMap((d) => (cases.find((c) => c.case_id === d.case_id)?.module) || []))];

  // D1/D2 关闭判定：D1 ← TC-HG-004；D2 ← TC-HG-005（直接）+ TC-HG-006/007（级联）
  const v = Object.fromEntries(details.map((d) => [d.case_id, d.verdict]));
  const d1Closed = v['TC-HG-004'] === 'pass';
  const d2Closed = v['TC-HG-005'] === 'pass' && v['TC-HG-006'] === 'pass' && v['TC-HG-007'] === 'pass';

  const report = {
    status: mergedPassed === mergedTotal ? 'pass' : 'fail',
    round: 2,
    pass_rate: mergedRate,
    pass_rate_formula: `(round1 pass ${r1PassedCount} + round2 pass ${r2Passed}) / ${mergedTotal} = ${mergedRate}`,
    failed_modules: r2FailedModules,
    global_batch_id: 'GB-HG-WB-20261006-001',
    hg_port: PORT,
    playback_smoke_ref: r1.playback_smoke_ref || null,
    round1_summary: {
      round: 1,
      status: r1.status,
      pass_rate: r1.pass_rate,
      verdicts: r1Verdicts,
      defects: (r1.defect_analysis || []).map((d) => ({ defect_id: d.defect_id, cases: d.cases, title: d.title })),
      fixed_by_commit: '8e17019 fix(流程B): D1 CSP放行媒体https域 + D2 favorites补score/hot+SeriesCard空值防护',
      evidence_dir: 'test/evidence/smoke/（r1 原始证据）+ test/evidence/archive/smoke_20261006_1502_r1_3of7/（前次残留归档）',
      engine_evidence_chain: r1.engine_evidence_chain || null,
    },
    defect_closure: {
      D1: { closed: d1Closed, closed_round: d1Closed ? 2 : null, verified_by: 'TC-HG-004（真实片源起播 + __HG_PLAYER_STATE__.hasVideo===true + currentTime 前进）' },
      D2: { closed: d2Closed, closed_round: d2Closed ? 2 : null, verified_by: 'TC-HG-005（收藏卡片标题+评分渲染、窗口内零 PAGEERROR、取消后列表移除）+ TC-HG-006/007（级联余波清零）' },
    },
    execution_notes: [
      'round 2 精准回归（单 Electron 实例，4 用例顺序执行，同 case_id 单执行）；证据全新采集落 test/evidence/smoke/r2/，未复用 r1。',
      '执行前环境准备：sqlite3 CLI 清理 r1 残留（favorites 1 条 / history progress_sec=0；应用未运行态）；user_version=1 → 本次启动真实经过 D2 的 v2 迁移（ALTER TABLE 加 score/hot 列）。',
      'TC-HG-004 追加 round2 裁定断言：__HG_PLAYER_STATE__.hasVideo===true 且 currentTime>0 前进（真实片源，CSP media-src 已放行 https:）。',
      'TC-HG-005 deviation：末步 assert_text「暂无内容」与实现空态文案「暂无收藏」不符（EmptyView text 覆盖默认值），按 round2 裁定语义「取消收藏→列表移除」断言 /暂无(收藏|内容)/；另追加收藏卡片标题+评分可见断言与窗口内零 PAGEERROR 断言。',
      'TC-HG-006 deviation×2：补「历史」tab 点击（同 r1）；history-item 点击落点取「续播」按钮（round2 裁定）；追加续播 URL ep 与 history 顶行 ep 一致性断言。',
      'TC-HG-007 round2 追加：切「漫剧」tab 栅格重渲染断言 + 后端佐证（type=comic code=0）。',
    ],
    details,
  };
  fs.writeFileSync(path.join(ROOT, 'smoke_test_report.json'), JSON.stringify(report, null, 1));

  // ---- defect-auto-grade.json：D1/D2 标 closed_round=2（未过则保持 open）----
  const dagPath = path.join(ROOT, 'test', 'evidence', 'smoke', 'defect-auto-grade.json');
  const dag = JSON.parse(fs.readFileSync(dagPath, 'utf8'));
  const closedMap = { D1: d1Closed, D2: d2Closed, 'D2-cascade': d2Closed };
  for (const d of dag.defects) {
    const base = d.defect_id === 'D1' ? 'D1' : 'D2';
    const closed = closedMap[d.defect_id] ?? closedMap[base];
    d.status = closed ? 'closed' : 'open';
    d.closed_round = closed ? 2 : null;
    d.verified_by = closed ? `round2 回归 ${R2_CASES.join('/')}（详见 smoke_test_report.json round=2 details）` : null;
  }
  dag.round2_update = { ts: new Date().toISOString(), fix_commit: '8e17019', r2_verdicts: v };
  fs.writeFileSync(dagPath, JSON.stringify(dag, null, 1));

  console.log(JSON.stringify({ status: report.status, round: 2, pass_rate: report.pass_rate, r2_passed: r2Passed, hg_port: PORT, d1Closed, d2Closed, verdicts: details.map((d) => [d.case_id, d.verdict, (d.error || '').slice(0, 120)]) }, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error('DRIVER_FATAL:', e);
  try { fs.writeFileSync(path.join(EVD, 'audit.log'), auditLines.join('\n') + `\nDRIVER_FATAL ${e}\n`); } catch {}
  process.exit(3);
});
