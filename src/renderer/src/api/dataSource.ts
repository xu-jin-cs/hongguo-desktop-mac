/**
 * dataSource 适配层（渲染层唯一数据访问入口，禁止页面散落 fetch）。
 *
 * 切换策略（mock 适配开关）：
 * - window.__HG_PORT__ > 0 且探活成功 → 走本地数据层 http://127.0.0.1:<port>/api/*
 * - 探活失败 / 端口为 0 / 请求网络异常 → 回落内置 mock（mock.ts，形态严格按 api_contract.json）
 * - 探活只看网络可达性：拿到 HTTP 响应即视为可达；502/504 属"服务可达、上游故障"，
 *   由业务请求按契约抛 ApiError 进页面 ERROR 态+重试，禁止误判不可达、禁止回落 mock。
 * - 不可达判定带 30s TTL，到期自动重探测，数据层恢复后可切回真实服务（禁止整会话静默 mock）。
 *
 * 写操作契约（审查 P1 修复）：addFavorite/postHistory 必须携带 title/cover（+total_episodes）
 * 元数据，真实模式 store 落库依赖渲染层传入；缺元数据会导致收藏卡片/历史行无封面无标题。
 */
import type {
  CategoryType,
  HistoryItem,
  ListData,
  PlayInfo,
  RankBoard,
  SeriesCard,
  SeriesDetail,
} from '../types';
import { ApiError } from '../types';
import * as mock from './mock';

const REQUEST_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 1500;
/** 服务不可达判定 TTL：到期后重新探测，数据层恢复可自动切回真实服务 */
const REPROBE_INTERVAL_MS = 30_000;

/** null = 未探测；true = 本地数据层网络不可达，回落 mock */
let serviceDown: boolean | null = null;
/** serviceDown=true 的落点时间（TTL 重探测依据） */
let serviceDownAt = 0;
/** /api/series 内存缓存（对齐 PRD 元数据缓存语义，渲染层短缓存 10min） */
const seriesCache = new Map<string, { at: number; data: SeriesDetail }>();
const SERIES_CACHE_TTL_MS = 10 * 60 * 1000;

function port(): number {
  return typeof window !== 'undefined' && window.__HG_PORT__ ? window.__HG_PORT__ : 0;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function serviceReachable(): Promise<boolean> {
  if (port() <= 0) return false;
  if (serviceDown !== null) {
    // 不可达判定带 TTL：到期后重新探测，避免数据层恢复后仍整会话滞留 mock
    if (serviceDown && Date.now() - serviceDownAt >= REPROBE_INTERVAL_MS) {
      serviceDown = null;
    } else {
      return !serviceDown;
    }
  }
  try {
    // 只看网络可达性：fetch 不抛异常（拿到任意 HTTP 响应）即视为服务可达。
    // 502/504 是"服务可达、上游故障"的业务错误码，不在这里判定（契约：抛 ApiError，不回落 mock）。
    await fetchWithTimeout(
      `http://127.0.0.1:${port()}/api/home?page=1&size=1`,
      { method: 'GET' },
      PROBE_TIMEOUT_MS,
    );
    serviceDown = false;
  } catch {
    // 网络层失败（连接拒绝/超时中止）：才判定不可达并回落 mock
    serviceDown = true;
    serviceDownAt = Date.now();
  }
  return !serviceDown;
}

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 统一请求：真实服务优先，网络层失败回落 mock；业务错误码直接抛 ApiError。
 */
async function request<T>(
  path: string,
  init: RequestInit,
  mockFn: () => T,
): Promise<T> {
  if (await serviceReachable()) {
    try {
      const res = await fetchWithTimeout(
        `http://127.0.0.1:${port()}${path}`,
        init,
        REQUEST_TIMEOUT_MS,
      );
      const env = (await res.json()) as Envelope<T>;
      if (env.code === 0) return env.data;
      throw new ApiError(env.code, env.msg ?? `code=${env.code}`);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // 网络层失败：标记服务不可达（带 TTL 可重探测）并回落 mock
      serviceDown = true;
      serviceDownAt = Date.now();
    }
  }
  return mockFn();
}

function qs(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const dataSource = {
  /** 当前是否处于 mock 模式（调试用） */
  isMockMode(): boolean {
    return serviceDown !== false;
  },

  getHome(page = 1, size = 20): Promise<ListData<SeriesCard>> {
    return request(`/api/home${qs({ page, size })}`, { method: 'GET' }, () =>
      mock.mockHome(page, size),
    );
  },

  getCategory(type: CategoryType, page = 1, size = 20): Promise<ListData<SeriesCard>> {
    return request(`/api/category${qs({ type, page, size })}`, { method: 'GET' }, () =>
      mock.mockCategory(type, page, size),
    );
  },

  getRank(board: RankBoard, size = 20): Promise<ListData<SeriesCard>> {
    return request(`/api/rank${qs({ board, size })}`, { method: 'GET' }, () =>
      mock.mockRank(board, size),
    );
  },

  search(q: string, page = 1, size = 20): Promise<ListData<SeriesCard>> {
    return request(`/api/search${qs({ q, page, size })}`, { method: 'GET' }, () =>
      mock.mockSearch(q, page, size),
    );
  },

  async getSeries(seriesId: string, noCache = false): Promise<SeriesDetail> {
    if (!noCache) {
      const hit = seriesCache.get(seriesId);
      if (hit && Date.now() - hit.at < SERIES_CACHE_TTL_MS) return hit.data;
    }
    const data = await request(
      `/api/series${qs({ series_id: seriesId })}`,
      { method: 'GET' },
      () => mock.mockSeriesDetail(seriesId),
    );
    seriesCache.set(seriesId, { at: Date.now(), data });
    return data;
  },

  getPlay(seriesId: string, ep: number): Promise<PlayInfo> {
    return request(`/api/play${qs({ series_id: seriesId, ep })}`, { method: 'GET' }, () =>
      mock.mockPlay(seriesId, ep),
    );
  },

  getWatched(seriesId: string): Promise<{ list: { ep: number; progress_sec: number }[] }> {
    return request(`/api/watched${qs({ series_id: seriesId })}`, { method: 'GET' }, () =>
      ({ list: [] }) as never,
    );
  },

  getFavorites(): Promise<ListData<SeriesCard>> {
    return request('/api/favorites', { method: 'GET' }, () => mock.mockGetFavorites());
  },

  addFavorite(
    seriesId: string,
    // D2 修复：meta 扩 score/hot，收藏落库持久化，供 Library 卡片渲染
    // 2026-10-06：meta 扩 episode——收藏时所在集，Library 点击跳回该集（缺省由 store 落 1）
    meta: { title?: string; cover?: string; total_episodes?: number; score?: number; hot?: number; episode?: number } = {},
  ): Promise<ListData<SeriesCard>> {
    return request(
      '/api/favorites',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 必须携带元数据：真实模式 store 以 body 落库，缺 title/cover 收藏卡片将无封面无标题
        body: JSON.stringify({ series_id: seriesId, ...meta }),
      },
      () => mock.mockAddFavorite(seriesId, meta),
    );
  },

  removeFavorite(seriesId: string): Promise<ListData<SeriesCard>> {
    return request(
      '/api/favorites',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId }),
      },
      () => mock.mockRemoveFavorite(seriesId),
    );
  },

  getHistory(): Promise<ListData<HistoryItem>> {
    return request('/api/history', { method: 'GET' }, () => mock.mockGetHistory());
  },

  postHistory(input: {
    series_id: string;
    ep: number;
    progress_sec: number;
    title?: string;
    cover?: string;
  }): Promise<ListData<HistoryItem>> {
    // input 必须携带 title/cover：真实模式 store 落库依赖调用方元数据，缺失则历史行空白
    return request(
      '/api/history',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      () => mock.mockPostHistory(input),
    );
  },

  deleteHistory(seriesId: string): Promise<ListData<HistoryItem>> {
    return request(
      '/api/history',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId }),
      },
      () => mock.mockDeleteHistory(seriesId),
    );
  },
};
