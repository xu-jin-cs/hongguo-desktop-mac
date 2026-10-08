/**
 * upstream 适配层单测（T-002 验收口径）：
 * - zod 校验通过/失败（失败抛 UpstreamError(validate)，不落脏数据）
 * - 超时 → 重试 1 次 → 仍失败抛 timeout（server 映射 504）
 * - 令牌桶节流：相邻请求间隔 >= minInterval
 * - _ROUTER_DATA 括号配平提取
 * 全部通过注入 fake rawFetch / sleep / now 实现，不打真实网络。
 */
import { describe, expect, it } from 'vitest';
import { UpstreamClient, UpstreamError, extractRouterData, type RawFetchResult } from '../src/main/upstream';

function html(data: unknown): string {
  return `<!doctype html><html><body><script>_ROUTER_DATA = ${JSON.stringify(data)}; function runWindowFn(){}</script></body></html>`;
}

function homeData(): unknown {
  return {
    loaderData: {
      page: {
        homeSections: [
          {
            tab_type: 'all',
            tab_name: '热播短剧',
            video_list: [
              {
                series_id: 's1',
                series_title: '剧一',
                series_cover: 'https://x/c1.png',
                episode_cnt: 80,
                rank: 1,
                create_time: '100',
                hot_score_data: { score: 99, text: '99热度' },
              },
              {
                series_id: 's2',
                series_title: '剧二',
                series_cover: 'https://x/c2.png',
                episode_cnt: 40,
                rank: 2,
                create_time: '200',
                hot_score_data: {},
              },
            ],
          },
          { tab_type: 'human', tab_name: '热播真人剧', video_list: [
            { series_id: 's3', series_title: '真人一', series_cover: '', episode_cnt: 10, rank: 1, create_time: '300' },
          ] },
        ],
      },
    },
  };
}

function categoryData(pageNum: number, ids: string[], total = 800): unknown {
  return {
    loaderData: {
      category_$: {
        recommendList: ids.map((id) => ({
          series_id: id,
          series_name: `剧${id}`,
          series_cover: `https://x/${id}.png`,
          series_intro: '简介',
          episode_cnt: 50,
          create_time: '500',
        })),
        pagination: { total, pageNum, pageSize: 24, totalPages: Math.ceil(total / 24) },
      },
    },
  };
}

function detailData(id: string, eps: number): unknown {
  return {
    loaderData: {
      detail_page: {
        seriesDetail: {
          series_id: id,
          series_name: '详情剧',
          series_cover: 'https://x/d.png',
          series_intro: '详情简介',
          episode_cnt: eps,
          vid_list: Array.from({ length: eps }, (_, i) => `vid-${i + 1}`),
          tags: ['家庭'],
        },
        seriesSocialInfo: { rating: 9.3, hot_score_data: { score: 55217829, text: '5521万热度' } },
      },
    },
  };
}

function playerData(duration = 159.667): unknown {
  return {
    loaderData: {
      'player_(series_id)/(vid)/page': {
        video_player_info: { duration, width: '720', height: '1280', poster_url: 'https://x/p.png', main_url: 'https://vod/x.mp4?sig=1' },
        seriesDetail: { episode_cnt: 3, vid_list: ['vid-1', 'vid-2', 'vid-3'] },
      },
    },
  };
}

/** 记录调用时序的 fake fetch 工厂（最长片段优先匹配，避免 '/' 吃掉 /category 等） */
function fakeFetch(routes: Record<string, unknown>, log?: string[]) {
  const frags = Object.keys(routes).sort((a, b) => b.length - a.length);
  return async (url: string): Promise<RawFetchResult> => {
    log?.push(url);
    for (const frag of frags) {
      if (url.includes(frag)) return { status: 200, body: html(routes[frag]) };
    }
    return { status: 404, body: 'not found' };
  };
}

function makeClient(rawFetch: (url: string) => Promise<RawFetchResult>, extra: { nowFn?: () => number; sleepFn?: (ms: number) => Promise<void> } = {}) {
  return new UpstreamClient({
    rawFetch: (url) => rawFetch(url),
    throttleMs: 300,
    sleepFn: extra.sleepFn ?? (() => Promise.resolve()),
    nowFn: extra.nowFn,
  });
}

describe('extractRouterData', () => {
  it('括号配平提取 JSON（后随代码不受影响）', () => {
    const d = extractRouterData(html({ a: { b: [1, 2, { c: 'x"y' }] } })) as { a: { b: unknown[] } };
    expect(d.a.b.length).toBe(3);
  });
  it('缺失 _ROUTER_DATA → UpstreamError(validate)', () => {
    expect(() => extractRouterData('<html></html>')).toThrow(UpstreamError);
  });
});

describe('zod 校验', () => {
  it('合法 home 数据通过并映射卡片字段', async () => {
    const c = makeClient(fakeFetch({ '/': homeData() }));
    const r = await c.getHome(1, 20);
    expect(r.list.length).toBe(3); // 跨 section 合并
    expect(r.list[0]).toMatchObject({ series_id: 's1', title: '剧一', hot: 99, total_episodes: 80 });
    expect(r.list[1].hot).toBe(0); // hot_score_data 空对象 → 0
    expect(r.has_more).toBe(false);
  });

  it('结构脏数据（episode_cnt 变字符串）→ validate 错误，不返回脏数据', async () => {
    const bad = homeData() as { loaderData: { page: { homeSections: { video_list: { episode_cnt: unknown }[] }[] } } };
    bad.loaderData.page.homeSections[0].video_list[0].episode_cnt = '八十';
    const c = makeClient(fakeFetch({ '/': bad }));
    await expect(c.getHome(1, 20)).rejects.toMatchObject({ kind: 'validate' });
  });

  it('detail_page 为 null → notfound（映射 404）', async () => {
    const c = makeClient(fakeFetch({ '/detail': { loaderData: { detail_page: null } } }));
    await expect(c.getSeries('ghost')).rejects.toMatchObject({ kind: 'notfound' });
  });
});

describe('超时与重试', () => {
  it('首次超时 → 重试 1 次成功', async () => {
    let calls = 0;
    const c = makeClient(async () => {
      calls++;
      if (calls === 1) {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        throw e;
      }
      return { status: 200, body: html(homeData()) };
    });
    const r = await c.getHome(1, 20);
    expect(r.list.length).toBe(3);
    expect(calls).toBe(2);
  });

  it('两次都超时 → 抛 timeout（server 映射 504）', async () => {
    let calls = 0;
    const c = makeClient(async () => {
      calls++;
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    await expect(c.getHome(1, 20)).rejects.toMatchObject({ kind: 'timeout' });
    expect(calls).toBe(2); // 1 + 重试 1 次
  });

  it('4xx 不重试', async () => {
    let calls = 0;
    const c = makeClient(async () => {
      calls++;
      return { status: 404, body: '' };
    });
    await expect(c.getHome(1, 20)).rejects.toMatchObject({ kind: 'notfound' });
    expect(calls).toBe(1);
  });
});

describe('令牌桶节流', () => {
  it('相邻请求间隔 >= minInterval', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const stamps: number[] = [];
    const sleepFn = async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    };
    const nowFn = () => now;
    const c = new UpstreamClient({
      rawFetch: async (url) => {
        stamps.push(nowFn());
        if (url.includes('/category/')) return { status: 200, body: html(categoryData(1, ['c1'])) };
        return { status: 200, body: html(homeData()) };
      },
      throttleMs: 300,
      sleepFn,
      nowFn,
    });
    await c.getHome(1, 20); // t=0
    await c.getCategory('real', 1, 20); // t>=300
    await c.getCategory('real', 2, 20); // t>=600
    expect(stamps.length).toBe(3);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(300);
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(300);
    expect(sleeps.every((s) => s <= 300)).toBe(true);
  });

  it('元数据缓存：10min TTL 内同键不重复请求', async () => {
    let calls = 0;
    let now = 1_000_000;
    const c = new UpstreamClient({
      rawFetch: async () => {
        calls++;
        return { status: 200, body: html(homeData()) };
      },
      throttleMs: 0,
      sleepFn: () => Promise.resolve(),
      nowFn: () => now,
      cacheTtlMs: 600_000,
    });
    await c.getHome(1, 20);
    now += 599_999;
    await c.getHome(1, 20); // 命中缓存
    expect(calls).toBe(1);
    now += 2; // 超过 TTL
    await c.getHome(1, 20);
    expect(calls).toBe(2);
  });
});

describe('端点映射逻辑', () => {
  it('category：本地 page/size 映射上游 24 条页并切片', async () => {
    const ids = Array.from({ length: 48 }, (_, i) => `id${i + 1}`);
    const c = makeClient(
      fakeFetch({
        'real-drama?page=1': categoryData(1, ids.slice(0, 24)),
        'real-drama?page=2': categoryData(2, ids.slice(24, 48)),
      }),
    );
    // size=20, page=2 → 上游第 1、2 页都要取，切片 [20,40)
    const r = await c.getCategory('real', 2, 20);
    expect(r.list.length).toBe(20);
    expect(r.list[0].series_id).toBe('id21');
    expect(r.list[19].series_id).toBe('id40');
    expect(r.has_more).toBe(true);
  });

  it('rank hot 映射 all section 且带 rank；new 按 create_time 倒序合成', async () => {
    const routes: Record<string, unknown> = { '/': homeData() };
    for (const t of ['real-drama', 'comic-drama', 'ai-drama', 'comic']) {
      routes[`/category/${t}?page=1`] = categoryData(1, [`${t}-a`, `${t}-b`], 48);
    }
    const c = makeClient(fakeFetch(routes));
    const hot = await c.getRank('hot', 20);
    expect(hot.list[0]).toMatchObject({ series_id: 's1', rank: 1 });
    const nw = await c.getRank('new', 3);
    expect(nw.list.length).toBe(3);
    // create_time 均为 '500'，稳定次序即可；断言 rank 递增
    expect(nw.list.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('series：vid_list 生成选集，episodes.playable 与时长默认 0', async () => {
    const c = makeClient(fakeFetch({ '/detail': detailData('s9', 3) }));
    const d = await c.getSeries('s9');
    expect(d.total_episodes).toBe(3);
    expect(d.episodes.map((e) => e.ep)).toEqual([1, 2, 3]);
    expect(d.episodes[0]).toMatchObject({ playable: true, duration: 0, title: '第1集' });
    expect(d.score).toBe(9.3);
    expect(d.hot).toBe(55217829);
  });

  it('play：ep 越界抛 validate；正常返回 play_url/duration/next_ep/prev_ep', async () => {
    const c = makeClient(fakeFetch({ '/detail': detailData('s9', 3), '/player/': playerData(90.4) }));
    await expect(c.getPlay('s9', 4)).rejects.toMatchObject({ kind: 'validate' });
    const p = await c.getPlay('s9', 2);
    expect(p.play_url).toContain('.mp4');
    expect(p.duration).toBe(90);
    expect(p.prev_ep).toBe(1);
    expect(p.next_ep).toBe(3);
    const last = await c.getPlay('s9', 3);
    expect(last.next_ep).toBeNull();
  });

  it('search：映射 video_data，has_more 恒 false（上游只回 10 条）', async () => {
    const data = {
      loaderData: {
        'search_(keyword)/page': {
          searchList: [
            { keyword: 'k1', name: '太太她不装了', video_data: { series_id: 'k1', series_title: '太太她不装了', series_cover: '', episode_cnt: 115 } },
          ],
          totalCount: 30,
        },
      },
    };
    const c = makeClient(fakeFetch({ '/search/': data }));
    const r = await c.getSearch('太太', 1, 20);
    expect(r.list[0].series_id).toBe('k1');
    expect(r.has_more).toBe(false);
  });
});
