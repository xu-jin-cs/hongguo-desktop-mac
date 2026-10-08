/**
 * 官方公开数据只读客户端（hongguoduanju.com）。
 * 合规边界（PRD §10 / A07-E13）：
 *  - 只读取 SSR 公开页面（首页/分类/搜索/详情/播放），只取正片与元数据；
 *  - 禁止触碰任何广告/激励/金币接口——本层根本没有这些路径（架构级不存在）；
 *  - 单接口请求间隔 >=300ms（Throttler 令牌桶）；
 *  - 元数据内存缓存 TTL 10min（播放地址为签名时效链接，不缓存）；
 *  - 超时 8s，失败重试 1 次；zod 校验失败 → 抛 UpstreamError(validate)（server 映射 502，不落脏数据）；
 *  - User-Agent 诚实标识本客户端。
 */
import { TtlCache } from './cache';
import { Throttler } from './throttle';
import { UpstreamError } from './errors';
import { extractRouterData } from './routerData';
import {
  categoryDataSchema,
  detailDataSchema,
  homeDataSchema,
  playerDataSchema,
  searchDataSchema,
  type RawCard,
} from './schema';
import type {
  CardList,
  CategoryType,
  PlayInfo,
  RankBoard,
  RankList,
  SeriesCard,
  SeriesDetail,
} from './types';

/** 诚实 UA：明确标识客户端身份与用途，不伪装浏览器。 */
export const USER_AGENT =
  'hongguo-desktop/1.0 (Electron main-process local data layer; personal non-distributed use)';

export interface RawFetchResult {
  status: number;
  body: string;
}

/** 可注入的底层抓取函数（测试时替换为假实现）。 */
export type RawFetch = (url: string, init: { headers: Record<string, string> }) => Promise<RawFetchResult>;

export interface UpstreamClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  throttleMs?: number;
  cacheTtlMs?: number;
  rawFetch?: RawFetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
}

/** 契约 type → 上游 category 路由段（实测映射，见 NOTES.md）。 */
const CATEGORY_ROUTE: Record<CategoryType, string> = {
  real: 'real-drama',
  comic: 'comic-drama',
  ai: 'ai-drama',
  manga: 'comic',
};

/** 上游分类页固定每页 24 条（实测）。 */
const UPSTREAM_PAGE_SIZE = 24;

function toCard(raw: RawCard): SeriesCard {
  return {
    series_id: raw.series_id,
    title: raw.series_title ?? raw.series_name ?? '',
    cover: raw.series_cover ?? '',
    hot: raw.hot_score_data?.score ?? 0,
    score: 0, // 列表页无评分字段；评分仅详情页 seriesSocialInfo.rating 提供
    total_episodes: raw.episode_cnt,
    latest_episode: raw.episode_cnt,
  };
}

export class UpstreamClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly throttler: Throttler;
  private readonly cache: TtlCache;
  private readonly rawFetch: RawFetch;

  constructor(opts: UpstreamClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://hongguoduanju.com';
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.retries = opts.retries ?? 1;
    this.throttler = new Throttler(opts.throttleMs ?? 300, opts.sleepFn, opts.nowFn);
    this.cache = new TtlCache(opts.cacheTtlMs ?? 10 * 60 * 1000, opts.nowFn);
    this.rawFetch = opts.rawFetch ?? ((url, init) => defaultRawFetch(url, init, this.timeoutMs));
  }

  /** 带节流 + 超时 + 重试的页面抓取，返回 HTML。 */
  private async fetchPage(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    let lastErr: UpstreamError | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this.throttler.acquire();
      try {
        const res = await this.rawFetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Referer: `${this.baseUrl}/`,
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (res.status === 404) throw new UpstreamError('notfound', `upstream 404: ${path}`, 404);
        if (res.status < 200 || res.status >= 300) {
          throw new UpstreamError('http', `upstream status ${res.status}: ${path}`, res.status);
        }
        return res.body;
      } catch (e) {
        const err = toUpstreamError(e);
        lastErr = err;
        // 4xx 属确定性失败，重试无意义
        if (err.kind === 'http' && err.status !== undefined && err.status < 500) throw err;
        if (err.kind === 'notfound') throw err;
      }
    }
    throw lastErr ?? new UpstreamError('network', `upstream request failed: ${path}`);
  }

  private async fetchJson<T>(path: string, cacheKey: string | null, parse: (data: unknown) => T): Promise<T> {
    if (cacheKey) {
      const hit = this.cache.get<T>(cacheKey);
      if (hit !== undefined) return hit;
    }
    const html = await this.fetchPage(path);
    const data = extractRouterData(html);
    const out = parse(data);
    if (cacheKey) this.cache.set(cacheKey, out);
    return out;
  }

  /** /api/home：首页 4 个 section 合并去重后的卡片全集（≤36 条），本地切片分页。 */
  async getHome(page: number, size: number): Promise<CardList> {
    const data = await this.fetchJson('/', 'home', (d) => parseOrThrow(homeDataSchema, d, 'home'));
    const seen = new Set<string>();
    const all: SeriesCard[] = [];
    for (const sec of data.loaderData.page.homeSections) {
      for (const raw of sec.video_list) {
        if (seen.has(raw.series_id)) continue;
        seen.add(raw.series_id);
        all.push(toCard(raw));
      }
    }
    const start = (page - 1) * size;
    return { list: all.slice(start, start + size), has_more: start + size < all.length };
  }

  /** /api/category：上游固定 24 条/页，本地 page/size 映射为上游页区间抓取后切片。 */
  async getCategory(type: CategoryType, page: number, size: number): Promise<CardList> {
    const route = CATEGORY_ROUTE[type];
    const start = (page - 1) * size;
    const end = start + size;
    const firstUpage = Math.floor(start / UPSTREAM_PAGE_SIZE) + 1;
    const lastUpage = Math.floor((end - 1) / UPSTREAM_PAGE_SIZE) + 1;

    const items: RawCard[] = [];
    let total = 0;
    for (let upage = firstUpage; upage <= lastUpage; upage++) {
      const data = await this.fetchJson(`/category/${route}?page=${upage}`, `cat:${type}:${upage}`, (d) =>
        parseOrThrow(categoryDataSchema, d, 'category'),
      );
      total = data.loaderData.category_$.pagination.total;
      items.push(...data.loaderData.category_$.recommendList);
    }
    const offset = start - (firstUpage - 1) * UPSTREAM_PAGE_SIZE;
    const list = items.slice(offset, offset + size).map(toCard);
    return { list, has_more: end < total };
  }

  /**
   * /api/rank：hot/real/comic 映射首页 section（all/human/comic，自带 rank）；
   * new 无上游新剧榜 SSR（实测 rank 页 content 为空，见 NOTES.md），
   * 以四个分类首页按 create_time 倒序合成。
   */
  async getRank(board: RankBoard, size: number): Promise<RankList> {
    let cards: SeriesCard[];
    if (board === 'new') {
      const types: CategoryType[] = ['real', 'comic', 'ai', 'manga'];
      const merged: RawCard[] = [];
      for (const t of types) {
        const route = CATEGORY_ROUTE[t];
        const data = await this.fetchJson(`/category/${route}?page=1`, `cat:${t}:1`, (d) =>
          parseOrThrow(categoryDataSchema, d, 'category'),
        );
        merged.push(...data.loaderData.category_$.recommendList);
      }
      merged.sort((a, b) => Number(b.create_time ?? 0) - Number(a.create_time ?? 0));
      cards = merged.map(toCard);
    } else {
      const sectionKey = board === 'hot' ? 'all' : board === 'real' ? 'human' : 'comic';
      const data = await this.fetchJson('/', 'home', (d) => parseOrThrow(homeDataSchema, d, 'home'));
      const sec = data.loaderData.page.homeSections.find((s) => s.tab_type === sectionKey);
      cards = (sec?.video_list ?? []).map(toCard);
    }
    return {
      list: cards.slice(0, size).map((c, i) => ({ ...c, rank: i + 1 })),
    };
  }

  /** /api/search：上游 SSR 只回前 10 条且分页参数无效（实测），has_more 恒 false。 */
  async getSearch(q: string, _page: number, _size: number): Promise<CardList> {
    const data = await this.fetchJson(`/search/${encodeURIComponent(q)}`, `search:${q}`, (d) =>
      parseOrThrow(searchDataSchema, d, 'search'),
    );
    const page = data.loaderData['search_(keyword)/page'];
    const list = page.searchList.map((item) => toCard(item.video_data));
    const total = Number(page.totalCount) || 0;
    return { list, has_more: false, total };
  }

  /** /api/series：详情页元数据 + vid_list 生成选集（duration 播放时才可知，见 NOTES.md）。 */
  async getSeries(seriesId: string): Promise<SeriesDetail> {
    const data = await this.fetchJson(`/detail?series_id=${encodeURIComponent(seriesId)}`, `series:${seriesId}`, (d) =>
      parseOrThrow(detailDataSchema, d, 'series'),
    );
    const dp = data.loaderData.detail_page;
    if (!dp) throw new UpstreamError('notfound', `series not found: ${seriesId}`, 404);
    const sd = dp.seriesDetail;
    const total = sd.episode_cnt;
    const vids = sd.vid_list;
    // 2026-10-06 全集通道打通（App 端解密兜底）后，全部集数可播；accessible 仅作信息字段保留
    const accessible = Math.min(sd.accessible_episode_cnt ?? total, vids.length);
    const episodes = Array.from({ length: total }, (_, i) => ({
      ep: i + 1,
      seq: i + 1,
      title: `第${i + 1}集`,
      duration: 0,
      playable: i < vids.length,
    }));
    return {
      series_id: sd.series_id,
      title: sd.series_name,
      cover: sd.series_cover,
      desc: sd.series_intro,
      hot: dp.seriesSocialInfo?.hot_score_data?.score ?? 0,
      score: dp.seriesSocialInfo?.rating ?? 0,
      total_episodes: total,
      accessible_episode_cnt: accessible,
      episodes,
    };
  }

  /** 取剧集 vid 列表（与 getSeries 同缓存键，App 端兜底通道用） */
  async getSeriesVids(seriesId: string): Promise<string[]> {
    const data = await this.fetchJson(`/detail?series_id=${encodeURIComponent(seriesId)}`, `series:${seriesId}`, (d) =>
      parseOrThrow(detailDataSchema, d, 'series'),
    );
    return data.loaderData.detail_page?.seriesDetail?.vid_list ?? [];
  }

  /** /api/play：由详情 vid_list[ep-1] 得 vid，再取播放页签名地址。播放地址不缓存。 */
  async getPlay(seriesId: string, ep: number): Promise<PlayInfo> {
    const data = await this.fetchJson(`/detail?series_id=${encodeURIComponent(seriesId)}`, `series:${seriesId}`, (d) =>
      parseOrThrow(detailDataSchema, d, 'series'),
    );
    const sd = data.loaderData.detail_page?.seriesDetail;
    if (!sd) throw new UpstreamError('notfound', `series not found: ${seriesId}`, 404);
    const total = sd.episode_cnt;
    if (ep < 1 || ep > total) {
      throw new UpstreamError('validate', `ep ${ep} out of range 1..${total}`);
    }
    const vid = sd.vid_list[ep - 1];
    if (!vid) throw new UpstreamError('notfound', `episode ${ep} has no vid`, 404);

    const player = await this.fetchJson(
      `/player/${encodeURIComponent(seriesId)}/${encodeURIComponent(vid)}`,
      null,
      (d) => parseOrThrow(playerDataSchema, d, 'play'),
    );
    const info = player.loaderData['player_(series_id)/(vid)/page']?.video_player_info;
    if (!info || !info.main_url) {
      throw new UpstreamError('notfound', `episode ${ep} play url unavailable`, 404);
    }
    return {
      play_url: info.main_url,
      duration: Math.round(info.duration),
      next_ep: ep < total ? ep + 1 : null,
      prev_ep: ep > 1 ? ep - 1 : null,
    };
  }
}

/** zod 校验入口：失败抛 UpstreamError(validate) → server 映射 502。 */
function parseOrThrow<T>(schema: { safeParse: (d: unknown) => { success: boolean; data?: T; error?: unknown } }, data: unknown, tag: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new UpstreamError('validate', `upstream schema mismatch at ${tag}: ${JSON.stringify(r.error).slice(0, 300)}`);
  }
  return r.data as T;
}

function toUpstreamError(e: unknown): UpstreamError {
  if (e instanceof UpstreamError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && (e.name === 'AbortError' || /timed?\s*out/i.test(msg))) {
    return new UpstreamError('timeout', `upstream timeout: ${msg}`);
  }
  return new UpstreamError('network', `upstream network error: ${msg}`);
}

/** 默认底层抓取：全局 fetch + AbortController 超时。 */
async function defaultRawFetch(
  url: string,
  init: { headers: Record<string, string> },
  timeoutMs: number,
): Promise<RawFetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: init.headers, signal: ctrl.signal, redirect: 'follow' });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
