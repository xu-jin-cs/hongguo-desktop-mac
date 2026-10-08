/**
 * upstream 共享类型：与 api_contract.json（唯一契约基线）对齐的出参结构。
 */

/** 列表卡片（/api/home /api/category /api/search /api/rank 的 list 元素） */
export interface SeriesCard {
  series_id: string;
  title: string;
  cover: string;
  hot: number;
  score: number;
  total_episodes: number;
  latest_episode: number;
}

/** 排行榜样片（/api/rank，卡片 + rank 名次） */
export interface RankCard extends SeriesCard {
  rank: number;
}

export interface CardList {
  /** 上游搜索总命中数（仅搜索有值；网页源上限仅返回前 10 条） */
  total?: number;
  list: SeriesCard[];
  has_more: boolean;
}

export interface RankList {
  list: RankCard[];
}

/** /api/series 出参 */
export interface EpisodeInfo {
  ep: number;
  seq: number;
  title: string;
  /** 秒；上游详情页不含单集时长，未播放前为 0（见 NOTES.md） */
  duration: number;
  playable: boolean;  /* false = App 独占集（官方网页源仅前 accessible_episode_cnt 集） */
}

export interface SeriesDetail {
  series_id: string;
  title: string;
  cover: string;
  desc: string;
  hot: number;
  score: number;
  total_episodes: number;
  accessible_episode_cnt?: number;
  episodes: EpisodeInfo[];
}

/** /api/play 出参 */
export interface PlayInfo {
  /** 实测为渐进式 MP4 直链（上游网页版未暴露 HLS，见 NOTES.md） */
  play_url: string;
  duration: number;
  next_ep: number | null;
  prev_ep: number | null;  source?: string;
}

export type CategoryType = 'real' | 'comic' | 'ai' | 'manga';
export type RankBoard = 'hot' | 'new' | 'real' | 'comic';
