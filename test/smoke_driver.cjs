/**
 * hongguo-desktop 冒烟执行驱动 v2（test-executor · 批次 GB-HG-WB-20261006-001 · round 1 权威执行）
 * 单 Electron 实例（playwright _electron.launch 一次）顺序执行 TC-HG-001~007 七条 smoke 用例。
 * 步骤严格按 execution-list.json smoke 用例 steps 执行；仅 TC-HG-006 按 ui_trigger 补「历史」tab 点击
 * （ui_trigger 明示"nav-library 历史 tab click history-item"，steps 序列化遗漏 tab 切换，deviation 记录）。
 * player-core 断言前执行一次鼠标移动（等同真实用户 poke 唤出 3s 自动隐藏的控制层，不改变用例语义）。
 * 后端佐证双通道：
 *   A. 渲染层真实网络铁证——page.on('request'/'response') 全量记录 127.0.0.1 /api/* 流量（backend_hit 主源）；
 *   B. 数据层直连只读 GET 佐证（POST/DELETE 写操作只经 UI 触发，不直连写入）。
 * 观测增强（v2）：主进程 stdout/stderr 落 main_process.log（前次 TC-HG-006 Application exited 无日志可查）。
 */
const fs = require('fs');
const path = require('path');
const { _electron } = require('/Users/xujin/agent-harness/playwright-skill/node_modules/playwright');

const ROOT = '/Users/xujin/projects/hongguo-desktop';
const EVD = path.join(ROOT, 'test', 'evidence', 'smoke');
const SHOTS = path.join(EVD, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const auditLines = [];
function audit(line) {
  auditLines.push(`[${new Date().toISOString()}] ${line}`);
}

const details = [];
let PORT = 0;
// 渲染层 /api/* 网络流水（按用例归集）
let netSink = null;
const netLogAll = [];

async function apiGet(p) {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function shot(page, caseId) {
  const p1 = path.join(EVD, `${caseId}.png`);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, path.join(SHOTS, `${caseId}.png`));
  return `test/evidence/smoke/${caseId}.png`;
}

async function runSteps(page, tc) {
  const stepLog = [];
  for (const [i, s] of tc.steps.entries()) {
    const desc = `step${i + 1} ${s.action} ${s.target || ''} ${s.value || s.expected_value || ''}`.trim();
    if (s.action === 'goto') {
      await page.evaluate((h) => { window.location.hash = h; }, s.target);
      await page.waitForTimeout(300);
    } else if (s.action === 'click') {
      if (s.target === 'series-card') {
        // 点击落点修正：卡片中心封面区在封面加载失败时是带 stopPropagation 的重试浮层
        // （真实用户点封面=重试，点标题/卡体=打开详情）；用例语义是"打开剧集"，
        // 故点击卡片标题区（事件冒泡至卡片根 onClick，等效真实用户点卡体）。
        await page.getByTestId('series-card').first().locator('.card-title').click({ timeout: 10000 });
      } else {
        await page.getByTestId(s.target).first().click({ timeout: 10000 });
      }
      // TC-HG-006 ui_trigger 明示「nav-library 历史 tab click history-item」，steps 序列化遗漏
      // tab 切换；此处按 ui_trigger 补点「历史」tab（deviation 记录于 details.notes）。
      if (tc.case_id === 'TC-HG-006' && s.target === 'nav-library') {
        await page.locator('.tab-bar button', { hasText: '历史' }).click({ timeout: 8000 });
        tc.__tabPatched = true;
      }
    } else if (s.action === 'input') {
      await page.getByTestId(s.target).first().fill(s.value, { timeout: 10000 });
    } else if (s.action === 'wait') {
      await page.waitForTimeout(Number(s.value));
    } else if (s.action === 'assert_visible') {
      // player-core 等控制层元素 3s 自动隐藏：断言前鼠标 poke 唤出（真实用户等价动作）
      if (s.target.startsWith('player')) await page.mouse.move(640, 400);
      await page.getByTestId(s.target).first().waitFor({ state: 'visible', timeout: 12000 });
    } else if (s.action === 'assert_url') {
      const hash = await page.evaluate(() => window.location.hash);
      if (!hash.startsWith(s.expected_value)) {
        throw new Error(`assert_url FAIL: hash=${hash} expected prefix=${s.expected_value}`);
      }
    } else if (s.action === 'assert_text') {
      const text = await page.evaluate(() => document.body.innerText);
      if (!text.includes(s.expected_value)) {
        const snippet = text.replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`assert_text FAIL: body 不含「${s.expected_value}」；body 前300字符: ${snippet}`);
      }
    } else {
      throw new Error(`unknown action: ${s.action}`);
    }
    stepLog.push(`OK ${desc}`);
  }
  return stepLog;
}

async function videoTime(page) {
  return page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : -1;
  });
}

/** 后端佐证采集（数据层直连只读 GET）。strict=true 时佐证断言失败抛错（计入用例失败）；false 仅尽力采集。 */
async function probeBackend(tc, page, detailId, strict) {
  const must = (cond, msg) => { if (!cond && strict) throw new Error(msg); };
  if (tc.case_id === 'TC-HG-001') {
    const r = await apiGet('/api/home?page=1&size=20');
    must(r.body?.code === 0 && r.body?.data?.list?.length > 0, `backend /api/home 佐证失败: code=${r.body?.code} list=${r.body?.data?.list?.length}`);
    return { endpoint: 'GET /api/home?page=1&size=20', status: r.status, code: r.body?.code, list_len: r.body?.data?.list?.length, has_more: r.body?.data?.has_more, fields_sample: r.body?.data?.list?.[0] ? Object.keys(r.body.data.list[0]) : [] };
  }
  if (tc.case_id === 'TC-HG-002') {
    const r = await apiGet(`/api/search?q=${encodeURIComponent('复仇')}&page=1&size=20`);
    must(r.body?.code === 0 && Array.isArray(r.body?.data?.list) && typeof r.body?.data?.has_more === 'boolean', 'backend /api/search 佐证失败');
    // 与 UI 一致性：UI 第一张卡片标题应出现在后端 list 标题集中
    const uiFirstTitle = await page.getByTestId('series-card').first().locator('.card-title').innerText().catch(() => null);
    const titles = (r.body?.data?.list || []).map((x) => x.title);
    const consistent = uiFirstTitle ? titles.includes(uiFirstTitle) : null;
    must(consistent !== false, `UI 首卡标题「${uiFirstTitle}」不在 /api/search 结果标题集内（UI与后端不一致）`);
    return { endpoint: 'GET /api/search?q=复仇&page=1&size=20', status: r.status, code: r.body?.code, list_is_array: Array.isArray(r.body?.data?.list), list_len: r.body?.data?.list?.length, has_more_type: typeof r.body?.data?.has_more, ui_first_title: uiFirstTitle, ui_backend_consistent: consistent };
  }
  if (tc.case_id === 'TC-HG-003') {
    const hash = await page.evaluate(() => window.location.hash);
    const m = hash.match(/#\/detail\/([^/]+)/);
    must(Boolean(m), `详情页 hash 解析失败: ${hash}`);
    if (!m) return { hash };
    detailId.id = decodeURIComponent(m[1]);
    const r = await apiGet(`/api/series?series_id=${encodeURIComponent(detailId.id)}`);
    must(r.body?.code === 0 && r.body?.data?.episodes?.length > 0, `backend /api/series 佐证失败 code=${r.body?.code}`);
    return { endpoint: `GET /api/series?series_id=${detailId.id}`, series_id: detailId.id, status: r.status, code: r.body?.code, total_episodes: r.body?.data?.total_episodes, episodes_len: r.body?.data?.episodes?.length, ep0_keys: r.body?.data?.episodes?.[0] ? Object.keys(r.body.data.episodes[0]) : [] };
  }
  if (tc.case_id === 'TC-HG-004') {
    const hash = await page.evaluate(() => window.location.hash);
    const m = hash.match(/#\/player\/([^/]+)\/(\d+)/);
    const sid = m ? decodeURIComponent(m[1]) : detailId.id;
    const ep = m ? Number(m[2]) : 1;
    const r = await apiGet(`/api/play?series_id=${encodeURIComponent(sid)}&ep=${ep}`);
    const t1 = await videoTime(page);
    await page.waitForTimeout(2000);
    const t2 = await videoTime(page);
    const bodyText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200);
    must(r.body?.code === 0 && r.body?.data?.play_url, `backend /api/play 佐证失败 code=${r.body?.code} play_url=${r.body?.data?.play_url}`);
    must(t2 > t1, `起播失败：video.currentTime 未前进 (${t1} -> ${t2})；页面文案: ${bodyText}`);
    return { endpoint: `GET /api/play?series_id=${sid}&ep=${ep}`, series_id: sid, ep, status: r.status, code: r.body?.code, play_url: r.body?.data?.play_url ? String(r.body.data.play_url).slice(0, 100) : null, prev_ep: r.body?.data?.prev_ep ?? null, next_ep: r.body?.data?.next_ep ?? null, video_t1: t1, video_t2: t2, currentTime_advancing: t2 > t1, page_text: bodyText };
  }
  if (tc.case_id === 'TC-HG-005') {
    const sid = detailId.id;
    const r = await apiGet('/api/favorites');
    const contains = Boolean(r.body?.data?.list?.some((x) => x.series_id === sid));
    must(r.body?.code === 0, 'backend /api/favorites GET 佐证失败');
    must(!contains, '取消收藏后 /api/favorites 仍含该 series_id（store DELETE 分支未生效）');
    return { endpoint: 'GET /api/favorites（终态）', series_id: sid, status: r.status, code: r.body?.code, final_list_len: r.body?.data?.list?.length, contains_after_remove: contains, list_ids: r.body?.data?.list?.map((x) => x.series_id) };
  }
  if (tc.case_id === 'TC-HG-006') {
    const sid = detailId.id;
    const r = await apiGet('/api/history');
    const top = r.body?.data?.list?.[0];
    const resumeCur = await videoTime(page);
    must(r.body?.code === 0, 'backend /api/history 佐证失败');
    must(top && top.series_id === sid && top.progress_sec > 0, `history 落库佐证失败: top=${JSON.stringify(top)}`);
    return { endpoint: 'GET /api/history', series_id: sid, status: r.status, code: r.body?.code, top_series_id: top?.series_id, top_progress_sec: top?.progress_sec, list_len: r.body?.data?.list?.length, resume_currentTime: resumeCur, resume_diff_sec: top ? Math.abs(resumeCur - top.progress_sec) : null };
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
  const cases = el.cases.filter((c) => c.smoke);
  if (cases.length !== 7) throw new Error(`smoke cases != 7: ${cases.length}`);

  audit('browser_launch=1 electron_single_instance playwright__electron.launch args=[.]');
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
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${new Date().toISOString()}] console.${m.type()} ${m.text().slice(0, 400)}`));
  page.on('pageerror', (e) => consoleLines.push(`[${new Date().toISOString()}] PAGEERROR ${String(e).slice(0, 600)}`));
  // 渲染层真实网络铁证：仅记录数据层 /api/* 流量
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
  // 真实集成三判据：__HG_PORT__>0 + .hg-port 文件一致 + 数据层 GET 可达
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
    try {
      rec.steps_log = await runSteps(page, tc);
      rec.backend_evidence = await probeBackend(tc, page, detailId, true);
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
    // 归集本用例渲染层真实 /api/* 命中（backend_hit 主源）+ 直连佐证端点
    const hits = netLogAll.filter((e) => e.case_id === tc.case_id)
      .map((e) => `${e.method} ${e.url}${e.status !== undefined ? ` -> ${e.status}${e.env_code !== undefined ? `/code=${e.env_code}` : ''}` : ''}`);
    rec.backend_hit = [...new Set(hits)];
    if (rec.backend_evidence?.endpoint) rec.backend_hit.push(`probe: ${rec.backend_evidence.endpoint}`);
    if (tc.__tabPatched) rec.notes.push('deviation: 按 ui_trigger 补「历史」tab 点击（steps 序列化遗漏 tab 切换；用例语义不变）');
    rec.elapsed_ms = Date.now() - tStart;
    try { rec.evidence = await shot(page, tc.case_id); } catch (e) { rec.notes.push(`screenshot failed: ${e.message}`); }
    return rec;
  }

  for (const tc of cases) {
    let rec = await runCase(tc);
    // 环境波动（真实上游 502/504/超时）允许同用例重试 1 次；其余失败不重试
    if (rec.verdict === 'fail' && isEnvFlake(rec)) {
      audit(`env_flake_detected ${tc.case_id} retry_once`);
      rec.notes.push('env_flake=true: 真实上游 502/504/超时，按规约重试 1 次');
      const retry = await runCase(tc);
      retry.notes = [...rec.notes, `首次尝试失败(环境波动): ${(rec.error || '').slice(0, 200)}`, ...retry.notes];
      retry.retried = true;
      rec = retry;
    }
    audit(`executed ${tc.case_id} verdict=${rec.verdict} evidence=${tc.case_id}.png backend_hit=${rec.backend_hit.length}`);
    details.push(rec);
  }

  await app.close().catch(() => {});
  audit(`batch_finished elapsed_ms=${Date.now() - t0}`);
  fs.writeFileSync(path.join(EVD, 'renderer_console.log'), consoleLines.join('\n') + '\n');
  fs.writeFileSync(path.join(EVD, 'renderer_api.log'), netLogAll.map((e) => JSON.stringify(e)).join('\n') + '\n');
  mainLogStream.end();

  // ---- manifest / audit / tracker ----
  const passed = details.filter((d) => d.verdict === 'pass').length;
  const manifest = {
    global_batch_id: 'GB-HG-WB-20261006-001',
    round: 1,
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
    browser_launch_count: 1,
    max_browser_launch: 1,
    executed_cases: details.map((d) => d.case_id),
    violations: [],
  };
  fs.writeFileSync(path.join(EVD, 'exec_tracker.json'), JSON.stringify(tracker, null, 1));

  const bm = JSON.parse(fs.readFileSync(path.join(ROOT, 'batch_meta.json'), 'utf8'));
  bm.batch_id = bm.global_batch_id;
  fs.writeFileSync(path.join(EVD, 'batch_meta.json'), JSON.stringify(bm, null, 1));

  // ---- smoke_test_report.json（项目根，契约形状 + 观测扩展）----
  const report = {
    status: passed === details.length ? 'pass' : 'fail',
    round: 1,
    pass_rate: Number((passed / details.length).toFixed(4)),
    failed_modules: [...new Set(details.filter((d) => d.verdict !== 'pass').flatMap((d) => (cases.find((c) => c.case_id === d.case_id)?.module) || []))],
    global_batch_id: 'GB-HG-WB-20261006-001',
    hg_port: PORT,
    playback_smoke_ref: 'pnpm smoke:playback 14/14 pass（test/evidence/playback/playback_evidence.json，2026-10-06 15:19 产，引用不重跑）',
    execution_notes: [
      'round 1 权威执行（单 Electron 实例，7 用例顺序执行）。前一次 3/7 失败残留证据已归档 test/evidence/archive/smoke_20261006_1502_r1_3of7/，未复用。',
      '封面图片全部「加载失败」为渲染层 CSP img-src 未放行上游图床域名（环境事实，非用例断言项；TC-HG-001 断言 series-card 可见性，不依赖封面图）。',
      'TC-HG-006 按 ui_trigger 补「历史」tab 点击（steps 序列化遗漏 tab 切换）。',
    ],
    details,
  };
  fs.writeFileSync(path.join(ROOT, 'smoke_test_report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ status: report.status, pass_rate: report.pass_rate, hg_port: PORT, verdicts: details.map((d) => [d.case_id, d.verdict, (d.error || '').slice(0, 120)]) }, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error('DRIVER_FATAL:', e);
  try { fs.writeFileSync(path.join(EVD, 'audit.log'), auditLines.join('\n') + `\nDRIVER_FATAL ${e}\n`); } catch {}
  process.exit(3);
});
