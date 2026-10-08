/**
 * 类型定义：严格对齐 api_contract.json（唯一接口基线）。
 * 渲染层只读响应包 data 字段；异常经 ApiError 携带 code。
 */

export interface SeriesCard {
  series_id: string;
  title: string;
  cover: string;
  hot: number;
  score: number;
  total_episodes: number;
  latest_episode: number;
  /** /api/rank 附加 */
  rank?: number;
  /** /api/favorites 附加：收藏时所在集（Library 点击跳回该集） */
  episode?: number;
}

export interface Episode {
  ep: number;
  seq: number;
  title: string;
  /** 秒 */
  duration: number;
  playable: boolean;
}

export interface SeriesDetail {
  accessible_episode_cnt?: number;
  series_id: string;
  title: string;
  cover: string;
  desc: string;
  hot: number;
  score: number;
  total_episodes: number;
  episodes: Episode[];
}

export interface PlayInfo {
  /** hls url；空串 = 该集暂不可播 */
  play_url: string;
  duration: number;
  next_ep: number | null;
  prev_ep: number | null;
  /** 片源通道：web_plain=官网明文 / app_api_decrypted=App端解密本地缓存（2026-10-07 全集通道） */
  source?: string;
}

export interface HistoryItem {
  series_id: string;
  title: string;
  cover: string;
  ep: number;
  progress_sec: number;
  updated_at: number;
}

export interface ListData<T> {
  list: T[];
  /** 搜索总命中数（仅搜索接口有值） */
  total?: number;
  has_more?: boolean;
}

export type CategoryType = 'real' | 'comic' | 'ai' | 'manga';
export type RankBoard = 'hot' | 'new' | 'real' | 'comic';

/** 业务异常：code 与契约一致（0/400/404/502/504） */
export class ApiError extends Error {
  readonly code: number;
  constructor(code: number, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** 错误码 → 页面文案（交互稿 §8 错误码映射） */
export function errorText(code: number): string {
  if (code === 502) return '片源异常';
  if (code === 504) return '网络超时';
  if (code === 404) return '内容不存在';
  return '加载失败';
}
