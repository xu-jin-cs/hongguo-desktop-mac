/**
 * 本地存储层（PRD §6）：better-sqlite3，favorites / history / settings 三表。
 * - favorites upsert 幂等（重复 POST 同 series_id 不产生副作用，created_at 保留首次值）
 * - history 按 updated_at 倒序查询，索引 idx_history_updated
 * - 进度 progress_sec 由 server 层截断到 [0,86400] 后落库
 * 经验遵循 retro-be-003：schema 初始化幂等（CREATE TABLE IF NOT EXISTS），禁删库重建。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export interface FavoriteRow {
  series_id: string;
  title: string;
  cover: string;
  total_episodes: number;
  /** 评分（D2 修复：收藏落库持久化，供 Library 卡片渲染） */
  score: number;
  /** 热度（同上） */
  hot: number;
  /** 收藏时所在集（2026-10-06 用户裁定：收藏列表点击须跳回该集，默认 1） */
  episode: number;
  created_at: number;
}

export interface HistoryRow {
  series_id: string;
  title: string;
  cover: string;
  ep: number;
  progress_sec: number;
  updated_at: number;
}

export class LocalStore {
  private readonly db: Database.Database;
  private readonly nowFn: () => number;

  constructor(dbPath: string, nowFn: () => number = () => Date.now()) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.nowFn = nowFn;
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    // 索引决策（A05-E03 宁缺毋滥）：history 列表查询 ORDER BY updated_at DESC → idx_history_updated 必建；
    // favorites ORDER BY created_at DESC 在 MVP 千行级量纲下全表扫足够，不建索引，防冗余。
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        series_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        cover TEXT NOT NULL DEFAULT '',
        total_episodes INTEGER NOT NULL DEFAULT 0,
        episode INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        series_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        cover TEXT NOT NULL DEFAULT '',
        ep INTEGER NOT NULL DEFAULT 1,
        progress_sec INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_updated ON history (updated_at DESC);
      CREATE TABLE IF NOT EXISTS watched (
        series_id TEXT NOT NULL,
        ep INTEGER NOT NULL,
        progress_sec INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (series_id, ep)
      );
      CREATE INDEX IF NOT EXISTS idx_watched_series ON watched(series_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
    `);
    // schema 版本锚（A03-E09）：未来加列走 ALTER TABLE 增量（retro-be-003 纪律，禁重建表），
    // 迁移代码按 user_version 判断是否需要执行。
    // D2 修复：favorites 补 score/hot 列。按列存在性判定（对 v1 既有库与新库均幂等），
    // ALTER TABLE ADD COLUMN 增量迁移，不删库不重建。
    const favCols = (this.db.pragma('table_info(favorites)') as { name: string }[]).map((c) => c.name);
    if (!favCols.includes('score')) {
      this.db.exec('ALTER TABLE favorites ADD COLUMN score REAL NOT NULL DEFAULT 0');
    }
    if (!favCols.includes('hot')) {
      this.db.exec('ALTER TABLE favorites ADD COLUMN hot INTEGER NOT NULL DEFAULT 0');
    }
    // 收藏集数列（2026-10-06 用户裁定：收藏须记录所在集，列表点击跳回该集）。
    // 同 score/hot 幂等增量迁移；存量收藏行落默认 1（点击跳第 1 集，行为与改版前进详情页等价再选集）。
    if (!favCols.includes('episode')) {
      this.db.exec('ALTER TABLE favorites ADD COLUMN episode INTEGER NOT NULL DEFAULT 1');
    }
    this.db.pragma('user_version = 3');
  }

  // ---- favorites ----

  listFavorites(): FavoriteRow[] {
    return this.db
      .prepare('SELECT series_id, title, cover, total_episodes, score, hot, episode, created_at FROM favorites ORDER BY created_at DESC')
      .all() as unknown as FavoriteRow[];
  }

  /** upsert 幂等：冲突时更新元数据但保留 created_at（首次收藏时间）；
   *  episode 未提供时保留既有值（详情页收藏不覆盖播放页记录的所在集）。 */
  upsertFavorite(row: {
    series_id: string;
    title?: string;
    cover?: string;
    total_episodes?: number;
    score?: number;
    hot?: number;
    episode?: number;
  }): void {
    const base = {
      series_id: row.series_id,
      title: row.title ?? '',
      cover: row.cover ?? '',
      total_episodes: row.total_episodes ?? 0,
      score: row.score ?? 0,
      hot: row.hot ?? 0,
      created_at: this.nowFn(),
    };
    if (row.episode === undefined) {
      // 不带集数：INSERT 走列默认 1；冲突保留既有 episode
      this.db
        .prepare(
          `INSERT INTO favorites (series_id, title, cover, total_episodes, score, hot, created_at)
           VALUES (@series_id, @title, @cover, @total_episodes, @score, @hot, @created_at)
           ON CONFLICT(series_id) DO UPDATE SET
             title = excluded.title,
             cover = excluded.cover,
             total_episodes = excluded.total_episodes,
             score = excluded.score,
             hot = excluded.hot`,
        )
        .run(base);
    } else {
      this.db
        .prepare(
          `INSERT INTO favorites (series_id, title, cover, total_episodes, score, hot, episode, created_at)
           VALUES (@series_id, @title, @cover, @total_episodes, @score, @hot, @episode, @created_at)
           ON CONFLICT(series_id) DO UPDATE SET
             title = excluded.title,
             cover = excluded.cover,
             total_episodes = excluded.total_episodes,
             score = excluded.score,
             hot = excluded.hot,
             episode = excluded.episode`,
        )
        .run({ ...base, episode: row.episode });
    }
  }

  /** 返回是否真实删除了一行。 */
  removeFavorite(seriesId: string): boolean {
    const r = this.db.prepare('DELETE FROM favorites WHERE series_id = ?').run(seriesId);
    return r.changes > 0;
  }

  isFavorite(seriesId: string): boolean {
    return this.db.prepare('SELECT 1 FROM favorites WHERE series_id = ?').get(seriesId) !== undefined;
  }

  // ---- history ----

  /** 观看历史，updated_at 倒序（最近观看在前）。 */
  listHistory(): HistoryRow[] {
    return this.db
      .prepare('SELECT series_id, title, cover, ep, progress_sec, updated_at FROM history ORDER BY updated_at DESC')
      .all() as unknown as HistoryRow[];
  }

  upsertHistory(row: {
    series_id: string;
    title?: string;
    cover?: string;
    ep: number;
    progress_sec: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO history (series_id, title, cover, ep, progress_sec, updated_at)
         VALUES (@series_id, @title, @cover, @ep, @progress_sec, @updated_at)
         ON CONFLICT(series_id) DO UPDATE SET
           title = CASE WHEN excluded.title != '' THEN excluded.title ELSE history.title END,
           cover = CASE WHEN excluded.cover != '' THEN excluded.cover ELSE history.cover END,
           ep = excluded.ep,
           progress_sec = excluded.progress_sec,
           updated_at = excluded.updated_at`,
      )
      .run({
        series_id: row.series_id,
        title: row.title ?? '',
        cover: row.cover ?? '',
        ep: row.ep,
        progress_sec: row.progress_sec,
        updated_at: this.nowFn(),
      });
  }

  /** 按集观看记录（看过即置灰的依据） */
  upsertWatched(row: { series_id: string; ep: number; progress_sec: number }): void {
    this.db
      .prepare(
        `INSERT INTO watched (series_id, ep, progress_sec, updated_at)
         VALUES (@series_id, @ep, @progress_sec, @updated_at)
         ON CONFLICT(series_id, ep) DO UPDATE SET
           progress_sec = MAX(watched.progress_sec, excluded.progress_sec),
           updated_at = excluded.updated_at`,
      )
      .run({ series_id: row.series_id, ep: row.ep, progress_sec: row.progress_sec, updated_at: this.nowFn() });
  }

  listWatched(seriesId: string): { ep: number; progress_sec: number }[] {
    return this.db
      .prepare('SELECT ep, progress_sec FROM watched WHERE series_id = ? ORDER BY ep ASC')
      .all(seriesId) as { ep: number; progress_sec: number }[];
  }

  removeHistory(seriesId: string): boolean {
    const r = this.db.prepare('DELETE FROM history WHERE series_id = ?').run(seriesId);
    return r.changes > 0;
  }

  getHistory(seriesId: string): HistoryRow | undefined {
    return this.db
      .prepare('SELECT series_id, title, cover, ep, progress_sec, updated_at FROM history WHERE series_id = ?')
      .get(seriesId) as HistoryRow | undefined;
  }

  // ---- settings ----

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
