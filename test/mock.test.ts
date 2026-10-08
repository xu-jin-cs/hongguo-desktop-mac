/**
 * mock 数据形态单测：断言与 api_contract.json 字段契约一致（mock 为 be 完成前的验收基线）。
 * 仅测纯数据函数，不触 localStorage（favorites/history 的 mock 持久化走浏览器环境）。
 */
import { describe, expect, it } from 'vitest';
import {
  mockCategory,
  mockHome,
  mockPlay,
  mockRank,
  mockSearch,
  mockSeriesAll,
  mockSeriesDetail,
} from '../src/renderer/src/api/mock';
import { ApiError } from '../src/renderer/src/types';

describe('mock 数据源契约一致性', () => {
  it('home 列表项字段齐全', () => {
    const { list, has_more } = mockHome(1, 20);
    expect(list.length).toBeGreaterThan(0);
    expect(has_more).toBe(true);
    for (const item of list) {
      expect(typeof item.series_id).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(typeof item.cover).toBe('string');
      expect(typeof item.hot).toBe('number');
      expect(typeof item.score).toBe('number');
      expect(Number.isInteger(item.total_episodes)).toBe(true);
      expect(Number.isInteger(item.latest_episode)).toBe(true);
    }
  });

  it('category 四类均可取且分页 has_more 正确', () => {
    for (const type of ['real', 'comic', 'ai', 'manga'] as const) {
      const r = mockCategory(type, 1, 20);
      expect(r.list.length).toBeGreaterThan(0);
      expect(r.has_more).toBe(false);
    }
    const p1 = mockHome(1, 10);
    expect(p1.has_more).toBe(true);
    const p3 = mockHome(3, 10);
    expect(p3.has_more).toBe(false);
  });

  it('rank 带 rank 字段且 size 上限 50', () => {
    const { list } = mockRank('hot', 50);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].rank).toBe(1);
    expect(mockRank('new', 100).list.length).toBeLessThanOrEqual(50);
  });

  it('search 空/超长抛 400（与前端拦截一致的契约口径）', () => {
    expect(() => mockSearch('', 1, 20)).toThrow(ApiError);
    expect(() => mockSearch('x'.repeat(51), 1, 20)).toThrow(ApiError);
    expect(mockSearch('逆袭', 1, 20).list.length).toBeGreaterThan(0);
  });

  it('series 详情含 episodes；157 集场景渲染数据齐全；不可播集标记 playable=false', () => {
    const all = mockSeriesAll();
    const big = all.find((s) => s.total_episodes === 157)!;
    const detail = mockSeriesDetail(big.series_id);
    expect(detail.episodes.length).toBe(157);
    expect(detail.episodes[0]).toMatchObject({ ep: 1, seq: 1 });
    const s5 = mockSeriesDetail('s5');
    expect(s5.episodes.find((e) => e.ep === 3)?.playable).toBe(false);
    expect(s5.episodes.find((e) => e.ep === 4)?.playable).toBe(true);
  });

  it('play 越界抛 400；prev_ep/next_ep 边界正确', () => {
    const d = mockSeriesDetail('s1');
    expect(() => mockPlay('s1', 0)).toThrow(ApiError);
    expect(() => mockPlay('s1', d.total_episodes + 1)).toThrow(ApiError);
    const first = mockPlay('s1', 1);
    expect(first.prev_ep).toBeNull();
    expect(first.next_ep).toBe(2);
    const last = mockPlay('s1', d.total_episodes);
    expect(last.next_ep).toBeNull();
    expect(typeof first.play_url).toBe('string');
    expect(first.play_url.length).toBeGreaterThan(0);
  });

  it('play_url 双形态：MP4（生产主路径，video.src 直挂）与 HLS（hls.js 分支）均被自测覆盖', () => {
    // 偶数编号剧集 → MP4；奇数 → HLS（上游实测全为渐进式 MP4，MP4 为必须演练的主路径）
    expect(mockPlay('s2', 1).play_url).toMatch(/\.mp4($|\?)/);
    expect(mockPlay('s1', 1).play_url).toMatch(/\.m3u8($|\?)/);
    // 不可播集仍为空串（不受形态影响）
    expect(mockPlay('s5', 3).play_url).toBe('');
  });
});
