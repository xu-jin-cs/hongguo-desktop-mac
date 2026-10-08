/**
 * 内置 mock 数据源（fe 自测 / 数据层未就绪时回落用）。
 * 数据形态严格按 api_contract.json；收藏/历史写操作落 localStorage。
 * 零网络依赖：封面为本地生成的 SVG data URI；play_url 双形态——奇数编号剧集为公共 HLS 测试流、
 * 偶数编号为 MP4 直链样本（上游实测全为渐进式 MP4，必须覆盖 Player video.src 直挂这一生产主路径）。
 */
import type {
  CategoryType,
  Episode,
  HistoryItem,
  ListData,
  PlayInfo,
  RankBoard,
  SeriesCard,
  SeriesDetail,
} from '../types';
import { ApiError } from '../types';

export type MockSeries = SeriesCard & { type: CategoryType; desc: string };

const TITLES: Array<[string, CategoryType, number]> = [
  ['逆袭之王者归来', 'real', 80],
  ['替嫁娇妻别想跑', 'real', 60],
  ['战神赘婿在都市', 'real', 100],
  ['闪婚后傅总马甲掉了', 'real', 45],
  ['重生之豪门千金', 'real', 90],
  ['都市仙医归来', 'real', 120],
  ['星海传说', 'comic', 36],
  ['剑来江湖', 'comic', 48],
  ['灵契少女', 'comic', 24],
  ['妖怪名单新编', 'comic', 60],
  ['全职高手传', 'comic', 40],
  ['风起苍岚', 'comic', 52],
  ['未来恋人', 'ai', 30],
  ['虚拟歌姬计划', 'ai', 16],
  ['时空旅人', 'ai', 25],
  ['机械之心', 'ai', 20],
  ['梦境追凶', 'ai', 12],
  ['数字修仙指南', 'ai', 33],
  ['一人之下传', 'manga', 157],
  ['镇魂街纪事', 'manga', 88],
  ['狐妖缘结', 'manga', 66],
  ['镖人行', 'manga', 42],
  ['长歌行传', 'manga', 70],
  ['雾山五行传', 'manga', 55],
];

const COVER_PALETTES: Array<[string, string]> = [
  ['#E03050', '#7A1530'],
  ['#5CA8FF', '#1E3A6E'],
  ['#FF8A3D', '#7A3A10'],
  ['#34D399', '#0F5A3E'],
  ['#FFC24B', '#7A5510'],
  ['#B07CFF', '#43287A'],
  ['#FF4D6A', '#6E1428'],
  ['#3DD6D0', '#0F5A57'],
];

/** 本地 SVG data URI 封面（零网络、零追踪） */
function makeCover(title: string, seed: number): string {
  const [c1, c2] = COVER_PALETTES[seed % COVER_PALETTES.length];
  const short = title.slice(0, 2);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='336' height='448' viewBox='0 0 336 448'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>` +
    `</linearGradient></defs>` +
    `<rect width='336' height='448' fill='url(#g)'/>` +
    `<text x='168' y='230' font-size='72' font-weight='700' fill='rgba(255,255,255,0.92)' ` +
    `text-anchor='middle' font-family='PingFang SC,sans-serif'>${short}</text>` +
    `<rect x='0' y='400' width='336' height='48' fill='rgba(0,0,0,0.28)'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let seriesCache: MockSeries[] | null = null;

export function mockSeriesAll(): MockSeries[] {
  if (seriesCache) return seriesCache;
  seriesCache = TITLES.map(([title, type, eps], i) => {
    const hot = 5_200_000 - i * 173_000;
    const score = Math.round((9.6 - i * 0.14) * 10) / 10;
    return {
      series_id: `s${i + 1}`,
      title,
      type,
      cover: makeCover(title, i),
      hot,
      score,
      total_episodes: eps,
      latest_episode: eps,
      desc: `${title}：本季高热短剧。${i % 2 === 0 ? '逆袭翻盘、爽点密集，' : '情感纠葛、反转不断，'}全 ${eps} 集已完结。`,
    };
  });
  return seriesCache;
}

function findSeries(seriesId: string): MockSeries | undefined {
  return mockSeriesAll().find((s) => s.series_id === seriesId);
}

function makeEpisodes(s: MockSeries): Episode[] {
  return Array.from({ length: s.total_episodes }, (_, i) => {
    const ep = i + 1;
    // 覆盖 ep-btn 禁用态场景：s5 的第 3、7 集暂不可播
    const playable = !(s.series_id === 's5' && (ep === 3 || ep === 7));
    return {
      ep,
      seq: ep,
      title: `${s.title} 第${ep}集`,
      duration: 80 + ((s.series_id.length * 37 + ep * 13) % 100),
      playable,
    };
  });
}

function page<T>(list: T[], pageNo: number, size: number): ListData<T> {
  const start = (pageNo - 1) * size;
  return { list: list.slice(start, start + size), has_more: start + size < list.length };
}

/* ---------- 列表/详情/播放 ---------- */

export function mockHome(pageNo = 1, size = 20): ListData<SeriesCard> {
  return page(mockSeriesAll(), pageNo, size);
}

export function mockCategory(type: CategoryType, pageNo = 1, size = 20): ListData<SeriesCard> {
  return page(mockSeriesAll().filter((s) => s.type === type), pageNo, size);
}

export function mockRank(board: RankBoard, size = 20): ListData<SeriesCard> {
  let list = mockSeriesAll();
  if (board === 'hot') list = [...list].sort((a, b) => b.hot - a.hot);
  else if (board === 'new') list = [...list].reverse();
  else list = list.filter((s) => s.type === board).sort((a, b) => b.hot - a.hot);
  const withRank = list.slice(0, Math.min(size, 50)).map((s, i) => ({ ...s, rank: i + 1 }));
  return { list: withRank, has_more: false };
}

export function mockSearch(q: string, pageNo = 1, size = 20): ListData<SeriesCard> {
  const kw = q.trim();
  if (!kw || kw.length > 50) throw new ApiError(400, '请输入 1-50 字关键词');
  return page(
    mockSeriesAll().filter((s) => s.title.includes(kw)),
    pageNo,
    size,
  );
}

export function mockSeriesDetail(seriesId: string): SeriesDetail {
  const s = findSeries(seriesId);
  if (!s) throw new ApiError(404, '剧集不存在');
  return {
    series_id: s.series_id,
    title: s.title,
    cover: s.cover,
    desc: s.desc,
    hot: s.hot,
    score: s.score,
    total_episodes: s.total_episodes,
    episodes: makeEpisodes(s),
  };
}

const MOCK_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
/** MP4 形态样例：NOTES.md 实测上游全为渐进式 MP4，mock 双形态保证 hls.js 与 video.src 两分支都被自测演练 */
const MOCK_MP4 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';

export function mockPlay(seriesId: string, ep: number): PlayInfo {
  const s = findSeries(seriesId);
  if (!s) throw new ApiError(404, '剧集不存在');
  if (ep < 1 || ep > s.total_episodes) throw new ApiError(400, '集数不存在');
  const episodes = makeEpisodes(s);
  const cur = episodes[ep - 1];
  const playable = cur ? cur.playable : false;
  // 偶数编号剧集走 MP4 直挂（生产主路径），奇数走 HLS（hls.js 分支），两形态都被自测覆盖
  const url = Number.parseInt(s.series_id.slice(1), 10) % 2 === 0 ? MOCK_MP4 : MOCK_HLS;
  return {
    play_url: playable ? url : '',
    duration: cur ? cur.duration : 0,
    next_ep: ep < s.total_episodes ? ep + 1 : null,
    prev_ep: ep > 1 ? ep - 1 : null,
  };
}

/* ---------- 收藏 / 历史（localStorage 持久化） ---------- */

const FAV_KEY = 'hg_mock_favorites';
const HIS_KEY = 'hg_mock_history';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage 不可用时静默降级为内存态 */
  }
}

export function mockGetWatched(_seriesId: string): { code: number; data: { list: { ep: number; progress_sec: number }[] } } {
  return { code: 0, data: { list: [] } };
}

export function mockGetFavorites(): ListData<SeriesCard> {
  return { list: readJson<SeriesCard[]>(FAV_KEY, []) };
}

export function mockAddFavorite(
  seriesId: string,
  meta: { title?: string; cover?: string; total_episodes?: number; score?: number; hot?: number; episode?: number } = {},
): ListData<SeriesCard> {
  const s = findSeries(seriesId);
  if (!s) throw new ApiError(404, '剧集不存在');
  const list = readJson<SeriesCard[]>(FAV_KEY, []);
  const existing = list.find((f) => f.series_id === seriesId);
  if (existing) {
    // 与真实模式 upsert 口径一致：重复收藏更新所在集
    if (meta.episode !== undefined) existing.episode = meta.episode;
    writeJson(FAV_KEY, list);
  } else {
    const { type: _type, desc: _desc, ...card } = s;
    // 调用方携带的元数据优先（与真实模式 body 落库口径一致），缺省回落 mock 数据集
    list.unshift({
      ...card,
      title: meta.title ?? s.title,
      cover: meta.cover ?? s.cover,
      total_episodes: meta.total_episodes ?? s.total_episodes,
      score: meta.score ?? s.score,
      hot: meta.hot ?? s.hot,
      episode: meta.episode ?? 1,
    });
    writeJson(FAV_KEY, list);
  }
  return { list: readJson<SeriesCard[]>(FAV_KEY, []) };
}

export function mockRemoveFavorite(seriesId: string): ListData<SeriesCard> {
  writeJson(
    FAV_KEY,
    readJson<SeriesCard[]>(FAV_KEY, []).filter((f) => f.series_id !== seriesId),
  );
  return { list: readJson<SeriesCard[]>(FAV_KEY, []) };
}

export function mockGetHistory(): ListData<HistoryItem> {
  const list = readJson<HistoryItem[]>(HIS_KEY, []);
  return { list: [...list].sort((a, b) => b.updated_at - a.updated_at) };
}

export function mockPostHistory(input: {
  series_id: string;
  ep: number;
  progress_sec: number;
  title?: string;
  cover?: string;
}): ListData<HistoryItem> {
  const s = findSeries(input.series_id);
  if (!s) throw new ApiError(404, '剧集不存在');
  const progress = Math.min(Math.max(0, Math.floor(input.progress_sec)), 86400);
  const list = readJson<HistoryItem[]>(HIS_KEY, []).filter(
    (h) => h.series_id !== input.series_id,
  );
  list.unshift({
    series_id: s.series_id,
    title: input.title ?? s.title,
    cover: input.cover ?? s.cover,
    ep: input.ep,
    progress_sec: progress,
    updated_at: Math.floor(Date.now() / 1000),
  });
  writeJson(HIS_KEY, list);
  return mockGetHistory();
}

export function mockDeleteHistory(seriesId: string): ListData<HistoryItem> {
  writeJson(
    HIS_KEY,
    readJson<HistoryItem[]>(HIS_KEY, []).filter((h) => h.series_id !== seriesId),
  );
  return mockGetHistory();
}
