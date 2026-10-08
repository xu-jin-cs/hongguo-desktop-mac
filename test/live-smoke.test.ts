/**
 * 真实上游联调冒烟（默认跳过；HG_LIVE_SMOKE=1 时启用）。
 * 真实请求 hongguoduanju.com，验证适配层对真实 SSR 结构的解析与全链路 code=0。
 * 请求经 300ms 令牌桶节流，合规自限。
 */
import { describe, expect, it } from 'vitest';
import { UpstreamClient } from '../src/main/upstream';

const LIVE = process.env.HG_LIVE_SMOKE === '1';

describe.skipIf(!LIVE)('live smoke（真实上游）', () => {
  const client = new UpstreamClient();

  it('home 真实卡片', async () => {
    const r = await client.getHome(1, 20);
    expect(r.list.length).toBeGreaterThan(0);
    expect(r.list[0].series_id).toMatch(/^\d+$/);
    expect(r.list[0].title.length).toBeGreaterThan(0);
    expect(r.list[0].total_episodes).toBeGreaterThan(0);
  }, 20000);

  it('category 四类真实可取', async () => {
    for (const t of ['real', 'comic', 'ai', 'manga'] as const) {
      const r = await client.getCategory(t, 1, 10);
      expect(r.list.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('search 真实结果', async () => {
    const r = await client.getSearch('太太', 1, 20);
    expect(r.list.length).toBeGreaterThan(0);
  }, 20000);

  it('series → play 全链（真实 vid 映射与 MP4 地址）', async () => {
    const home = await client.getHome(1, 1);
    const id = home.list[0].series_id;
    const d = await client.getSeries(id);
    expect(d.episodes.length).toBe(d.total_episodes);
    expect(d.episodes[0].playable).toBe(true);
    const p = await client.getPlay(id, 1);
    expect(p.play_url).toMatch(/^https:\/\//);
    expect(p.duration).toBeGreaterThan(0);
    expect(p.prev_ep).toBeNull();
  }, 30000);

  it('rank 四榜真实可取', async () => {
    for (const b of ['hot', 'new', 'real', 'comic'] as const) {
      const r = await client.getRank(b, 10);
      expect(r.list.length).toBeGreaterThan(0);
      expect(r.list[0].rank).toBe(1);
    }
  }, 30000);
});
