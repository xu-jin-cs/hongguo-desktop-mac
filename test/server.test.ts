/**
 * 本地数据层服务单测（T-003 验收口径）：
 * - 9 端点全集正反边界（枚举非法/越界/q 长度/ep 边界/progress_sec 截断）
 * - 统一响应包 {code,msg,data}，HTTP 状态与 code 一致
 * - .hg-port 端口文件落盘
 * upstream 用 fake rawFetch 注入，store 用 :memory:。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UpstreamClient, type RawFetchResult } from '../src/main/upstream';
import { LocalStore } from '../src/main/store';
import { createRequestHandler } from '../src/main/server/app';
import http from 'node:http';

function html(data: unknown): string {
  return `<script>_ROUTER_DATA = ${JSON.stringify(data)};</script>`;
}

const DETAIL = {
  loaderData: {
    detail_page: {
      seriesDetail: {
        series_id: 's1',
        series_name: '测试剧',
        series_cover: 'https://x/c.png',
        series_intro: '简介',
        episode_cnt: 3,
        vid_list: ['v1', 'v2', 'v3'],
      },
      seriesSocialInfo: { rating: 8.8, hot_score_data: { score: 1000 } },
    },
  },
};

const HOME = {
  loaderData: {
    page: {
      homeSections: [
        {
          tab_type: 'all',
          video_list: [
            { series_id: 's1', series_title: '剧一', series_cover: '', episode_cnt: 3, rank: 1, create_time: '100' },
            { series_id: 's2', series_title: '剧二', series_cover: '', episode_cnt: 5, rank: 2, create_time: '200' },
          ],
        },
        { tab_type: 'human', video_list: [{ series_id: 's3', series_title: '剧三', series_cover: '', episode_cnt: 9, rank: 1 }] },
        { tab_type: 'comic', video_list: [{ series_id: 's4', series_title: '漫一', series_cover: '', episode_cnt: 7, rank: 1 }] },
      ],
    },
  },
};

const CATEGORY = {
  loaderData: {
    category_$: {
      recommendList: [{ series_id: 'c1', series_name: '分类剧', series_cover: '', episode_cnt: 12, create_time: '300' }],
      pagination: { total: 1, pageNum: 1, pageSize: 24, totalPages: 1 },
    },
  },
};

const SEARCH = {
  loaderData: {
    'search_(keyword)/page': {
      searchList: [{ keyword: 's1', video_data: { series_id: 's1', series_title: '测试剧', series_cover: '', episode_cnt: 3 } }],
      totalCount: 1,
    },
  },
};

const PLAYER = {
  loaderData: {
    'player_(series_id)/(vid)/page': {
      video_player_info: { duration: 100, main_url: 'https://vod/x.mp4' },
    },
  },
};

let base = '';
let tmpDir = '';
let closeServer: () => Promise<void>;

beforeAll(async () => {
  const rawFetch = async (url: string): Promise<RawFetchResult> => {
    if (url.includes('/player/')) return { status: 200, body: html(PLAYER) };
    if (url.includes('/detail')) return { status: 200, body: html(DETAIL) };
    if (url.includes('/search/')) return { status: 200, body: html(SEARCH) };
    if (url.includes('/category/')) return { status: 200, body: html(CATEGORY) };
    return { status: 200, body: html(HOME) };
  };
  const upstream = new UpstreamClient({ rawFetch: (url) => rawFetch(url), throttleMs: 0, sleepFn: () => Promise.resolve() });
  const store = new LocalStore(':memory:');
  const handler = createRequestHandler({ upstream, store });
  const server = http.createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
  closeServer = () =>
    new Promise<void>((r) => {
      store.close();
      server.close(() => r());
    });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-test-'));
});

afterAll(async () => {
  await closeServer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(p: string, init?: RequestInit): Promise<{ http: number; body: { code: number; msg: string; data: never } }> {
  const res = await fetch(`${base}${p}`, init);
  const body = (await res.json()) as { code: number; msg: string; data: never };
  return { http: res.status, body };
}

describe('统一响应包与正向端点', () => {
  it('/api/home 正向 + 包结构', async () => {
    const r = await api('/api/home');
    expect(r.http).toBe(200);
    expect(r.body.code).toBe(0);
    expect(Array.isArray((r.body.data as { list: unknown[] }).list)).toBe(true);
  });

  it('/api/category type=real 正向', async () => {
    const r = await api('/api/category?type=real&page=1&size=20');
    expect(r.body.code).toBe(0);
  });

  it('/api/rank board=hot 正向带 rank', async () => {
    const r = await api('/api/rank?board=hot&size=10');
    expect(r.body.code).toBe(0);
    const list = (r.body.data as { list: { rank: number }[] }).list;
    expect(list[0].rank).toBe(1);
  });

  it('/api/search 正向', async () => {
    const r = await api(`/api/search?q=${encodeURIComponent('测试')}`);
    expect(r.body.code).toBe(0);
    expect((r.body.data as { has_more: boolean }).has_more).toBe(false);
  });

  it('/api/series 正向含 episodes', async () => {
    const r = await api('/api/series?series_id=s1');
    expect(r.body.code).toBe(0);
    const d = r.body.data as { total_episodes: number; episodes: { ep: number }[]; score: number };
    expect(d.total_episodes).toBe(3);
    expect(d.episodes.length).toBe(3);
    expect(d.score).toBe(8.8);
  });

  it('/api/play 边界 ep=1 / ep=total 的 prev/next', async () => {
    const first = await api('/api/play?series_id=s1&ep=1');
    expect((first.body.data as { prev_ep: number | null }).prev_ep).toBeNull();
    const last = await api('/api/play?series_id=s1&ep=3');
    expect((last.body.data as { next_ep: number | null }).next_ep).toBeNull();
    expect((last.body.data as { play_url: string }).play_url).toContain('.mp4');
  });
});

describe('400 反向边界', () => {
  it('type 非法枚举 → 400', async () => {
    const r = await api('/api/category?type=unknown');
    expect(r.http).toBe(400);
    expect(r.body.code).toBe(400);
  });

  it('board 非法枚举 → 400', async () => {
    expect((await api('/api/rank?board=manga')).body.code).toBe(400);
    expect((await api('/api/rank')).body.code).toBe(400); // board 必填
  });

  it('q 缺失/空/超长 → 400', async () => {
    expect((await api('/api/search')).body.code).toBe(400);
    expect((await api('/api/search?q=')).body.code).toBe(400);
    expect((await api(`/api/search?q=${'长'.repeat(51)}`)).body.code).toBe(400);
    expect((await api(`/api/search?q=${'长'.repeat(50)}`)).body.code).toBe(0); // 50 字边界放行
  });

  it('page/size 越界 → 400；边界值放行', async () => {
    expect((await api('/api/home?page=0')).body.code).toBe(400);
    expect((await api('/api/home?page=1.5')).body.code).toBe(400);
    expect((await api('/api/home?size=0')).body.code).toBe(400);
    expect((await api('/api/home?size=51')).body.code).toBe(400);
    expect((await api('/api/home?page=1&size=50')).body.code).toBe(0);
    expect((await api('/api/home?page=1&size=1')).body.code).toBe(0);
  });

  it('ep 越界（0 或 > total_episodes）→ 400', async () => {
    expect((await api('/api/play?series_id=s1&ep=0')).body.code).toBe(400);
    expect((await api('/api/play?series_id=s1&ep=4')).body.code).toBe(400); // total=3
    expect((await api('/api/play?series_id=s1&ep=abc')).body.code).toBe(400);
  });

  it('series_id 缺失 → 400', async () => {
    expect((await api('/api/series')).body.code).toBe(400);
    expect((await api('/api/play?ep=1')).body.code).toBe(400);
  });

  it('未知路径 → 404', async () => {
    expect((await api('/api/nonexistent')).body.code).toBe(404);
  });
});

describe('favorites / history 端点', () => {
  it('favorites POST 幂等：重复 POST 同 id 仍一行；DELETE 移除', async () => {
    const post = () =>
      api('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: 's1', title: '测试剧', cover: 'c', total_episodes: 3 }),
      });
    await post();
    const r = await post(); // 重复 POST
    const list = (r.body.data as { list: { series_id: string }[] }).list;
    expect(list.filter((x) => x.series_id === 's1').length).toBe(1);
    const del = await api('/api/favorites', { method: 'DELETE', body: JSON.stringify({ series_id: 's1' }) });
    expect((del.body.data as { list: unknown[] }).list.length).toBe(0);
  });

  it('favorites POST 缺 series_id → 400', async () => {
    const r = await api('/api/favorites', { method: 'POST', body: JSON.stringify({}) });
    expect(r.body.code).toBe(400);
  });

  it('D2：favorites POST 携带 score/hot → GET 返回带上（落库往返一致）', async () => {
    await api('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ series_id: 'sf', title: '评分剧', cover: 'c', total_episodes: 10, score: 9.2, hot: 34567 }),
    });
    const r = await api('/api/favorites');
    const list = (r.body.data as { list: { series_id: string; score: number; hot: number }[] }).list;
    expect(list.find((x) => x.series_id === 'sf')).toMatchObject({ score: 9.2, hot: 34567 });
    // 缺 score/hot 的旧调用形态不报错，落 0
    await api('/api/favorites', { method: 'POST', body: JSON.stringify({ series_id: 'sf2', title: '旧调用' }) });
    const r2 = await api('/api/favorites');
    const list2 = (r2.body.data as { list: { series_id: string; score: number; hot: number }[] }).list;
    expect(list2.find((x) => x.series_id === 'sf2')).toMatchObject({ score: 0, hot: 0 });
    // 清理，避免影响其他用例
    await api('/api/favorites', { method: 'DELETE', body: JSON.stringify({ series_id: 'sf' }) });
    await api('/api/favorites', { method: 'DELETE', body: JSON.stringify({ series_id: 'sf2' }) });
  });

  it('history POST 落库 + progress_sec 越界截断到 86400；GET 倒序', async () => {
    await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({ series_id: 's2', title: '旧', ep: 1, progress_sec: 10 }),
    });
    await new Promise((r) => setTimeout(r, 5));
    const r = await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({ series_id: 's1', title: '新', ep: 2, progress_sec: 99999 }),
    });
    const list = (r.body.data as { list: { series_id: string; progress_sec: number; updated_at: number }[] }).list;
    expect(list[0].series_id).toBe('s1'); // updated_at 最新在前
    expect(list[0].progress_sec).toBe(86400); // 截断
    // 负值截断到 0
    const r2 = await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({ series_id: 's1', ep: 2, progress_sec: -5 }),
    });
    expect((r2.body.data as { list: { progress_sec: number }[] }).list[0].progress_sec).toBe(0);
    // DELETE
    const del = await api('/api/history?series_id=s1', { method: 'DELETE' });
    expect((del.body.data as { list: { series_id: string }[] }).list.map((x) => x.series_id)).toEqual(['s2']);
  });

  it('history POST 参数非法 → 400', async () => {
    expect(
      (await api('/api/history', { method: 'POST', body: JSON.stringify({ series_id: 's1', ep: 0, progress_sec: 1 }) })).body.code,
    ).toBe(400);
    expect(
      (await api('/api/history', { method: 'POST', body: JSON.stringify({ series_id: 's1', ep: 1, progress_sec: 'abc' }) })).body.code,
    ).toBe(400);
    expect(
      (await api('/api/history', { method: 'POST', body: JSON.stringify({ series_id: 's1', ep: 1 }) })).body.code,
    ).toBe(400); // progress_sec 缺失
  });
});

describe('startServer 端口文件', () => {
  it('绑定 127.0.0.1 随机端口并把端口写入 .hg-port', async () => {
    const { startServerHandle } = await import('../src/main/server/index');
    const portFile = path.join(tmpDir, '.hg-port');
    const upstream = new UpstreamClient({
      rawFetch: async () => ({ status: 200, body: html(HOME) }),
      throttleMs: 0,
      sleepFn: () => Promise.resolve(),
    });
    const handle = await startServerHandle({ dbPath: ':memory:', portFile, upstream });
    expect(handle.port).toBeGreaterThan(0);
    expect(fs.readFileSync(portFile, 'utf-8')).toBe(String(handle.port));
    const r = await fetch(`http://127.0.0.1:${handle.port}/api/home`);
    expect((await r.json()).code).toBe(0);
    await handle.close();
  });
});

describe('502/504 映射', () => {
  it('上游 zod 校验失败 → 502；上游超时 → 504', async () => {
    const badUpstream = new UpstreamClient({
      rawFetch: async () => ({ status: 200, body: '<html>no data</html>' }),
      throttleMs: 0,
      sleepFn: () => Promise.resolve(),
    });
    const store = new LocalStore(':memory:');
    const srv = http.createServer((req, res) => void createRequestHandler({ upstream: badUpstream, store })(req, res));
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    const r = await fetch(`http://127.0.0.1:${port}/api/home`);
    expect((await r.json()).code).toBe(502);
    await new Promise<void>((r) => srv.close(() => r()));

    const slowUpstream = new UpstreamClient({
      rawFetch: async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      },
      throttleMs: 0,
      sleepFn: () => Promise.resolve(),
    });
    const srv2 = http.createServer((req, res) => void createRequestHandler({ upstream: slowUpstream, store })(req, res));
    await new Promise<void>((r) => srv2.listen(0, '127.0.0.1', r));
    const port2 = (srv2.address() as { port: number }).port;
    const r2 = await fetch(`http://127.0.0.1:${port2}/api/home`);
    expect(r2.status).toBe(504);
    expect((await r2.json()).code).toBe(504);
    await new Promise<void>((r2resolve) => srv2.close(() => r2resolve()));
    store.close();
  });
});
