/**
 * 本地存储层单测（T-004 验收口径）：
 * - 三表 + idx_history_updated 索引存在
 * - favorites upsert 幂等（重复写入同 series_id 状态不变，created_at 保留首次值）
 * - history 按 updated_at 倒序
 * - settings 读写
 * 全程使用 :memory: 数据库，不触磁盘。
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStore } from '../src/main/store';

function makeStore(now = 1_000_000) {
  let t = now;
  const store = new LocalStore(':memory:', () => t);
  return { store, tick: (ms: number) => (t += ms) };
}

describe('LocalStore favorites', () => {
  it('upsert 幂等：重复写入同 series_id 只有一行，created_at 保留首次', () => {
    const { store, tick } = makeStore();
    store.upsertFavorite({ series_id: 's1', title: '剧一', cover: 'c1', total_episodes: 80 });
    tick(5000);
    store.upsertFavorite({ series_id: 's1', title: '剧一', cover: 'c1', total_episodes: 80 });
    const list = store.listFavorites();
    expect(list.length).toBe(1);
    expect(list[0].created_at).toBe(1_000_000);
    expect(store.isFavorite('s1')).toBe(true);
    store.close();
  });

  it('upsert 冲突时更新元数据；remove 返回真实性', () => {
    const { store } = makeStore();
    store.upsertFavorite({ series_id: 's1', title: '旧名', total_episodes: 1 });
    store.upsertFavorite({ series_id: 's1', title: '新名', total_episodes: 99 });
    expect(store.listFavorites()[0]).toMatchObject({ title: '新名', total_episodes: 99 });
    expect(store.removeFavorite('s1')).toBe(true);
    expect(store.removeFavorite('s1')).toBe(false); // 已删，再删为 false
    expect(store.isFavorite('s1')).toBe(false);
    store.close();
  });

  it('listFavorites 按 created_at 倒序', () => {
    const { store, tick } = makeStore();
    store.upsertFavorite({ series_id: 'a' });
    tick(1000);
    store.upsertFavorite({ series_id: 'b' });
    tick(1000);
    store.upsertFavorite({ series_id: 'c' });
    expect(store.listFavorites().map((r) => r.series_id)).toEqual(['c', 'b', 'a']);
    store.close();
  });

  it('D2：score/hot 落库往返一致；冲突更新；缺省落 0', () => {
    const { store } = makeStore();
    store.upsertFavorite({ series_id: 's1', title: '剧一', score: 9.2, hot: 12345 });
    expect(store.listFavorites()[0]).toMatchObject({ series_id: 's1', score: 9.2, hot: 12345 });
    // 冲突更新元数据（含 score/hot）
    store.upsertFavorite({ series_id: 's1', score: 7.5, hot: 999 });
    expect(store.listFavorites()[0]).toMatchObject({ score: 7.5, hot: 999 });
    // 缺省落 0（旧调用方不带字段时不炸库）
    store.upsertFavorite({ series_id: 's2', title: '无评分' });
    const row = store.listFavorites().find((r) => r.series_id === 's2');
    expect(row).toMatchObject({ score: 0, hot: 0 });
    store.close();
  });

  it('D2：v1 旧库幂等迁移——ALTER TABLE 补 score/hot，存量数据保留，二次打开幂等', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-store-migrate-'));
    const dbPath = path.join(dir, 'app.db');
    // 构造 v1 旧 schema（favorites 无 score/hot 列）+ 存量行
    const legacy = new Database(dbPath);
    legacy.exec(
      `CREATE TABLE favorites (
        series_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        cover TEXT NOT NULL DEFAULT '',
        total_episodes INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      INSERT INTO favorites VALUES ('old1', '老剧', 'c.png', 80, 111);`,
    );
    legacy.pragma('user_version = 1');
    legacy.close();

    const store = new LocalStore(dbPath);
    // 迁移后旧行保留，新列默认值 0；episode 列默认 1（2026-10-06 收藏集数迁移）
    expect(store.listFavorites()[0]).toMatchObject({ series_id: 'old1', title: '老剧', score: 0, hot: 0, episode: 1 });
    // 迁移后可写入新字段
    store.upsertFavorite({ series_id: 'old1', score: 8.1, hot: 500, episode: 33 });
    expect(store.listFavorites()[0]).toMatchObject({ score: 8.1, hot: 500, episode: 33 });
    store.close();
    // 二次打开幂等（列已存在不再 ALTER，数据不丢）
    const store2 = new LocalStore(dbPath);
    expect(store2.listFavorites()[0]).toMatchObject({ series_id: 'old1', score: 8.1, hot: 500, episode: 33 });
    store2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('收藏集数（2026-10-06 用户裁定）：落库往返一致；冲突时携带则更新、缺省保留旧值', () => {
    const { store } = makeStore();
    // 播放页第 33 集收藏 → 落 33
    store.upsertFavorite({ series_id: 's1', title: '剧一', total_episodes: 80, episode: 33 });
    expect(store.listFavorites()[0]).toMatchObject({ series_id: 's1', episode: 33 });
    // 详情页再次收藏（不带 episode）→ 保留 33，不被重置
    store.upsertFavorite({ series_id: 's1', title: '剧一', total_episodes: 80 });
    expect(store.listFavorites()[0]).toMatchObject({ episode: 33 });
    // 播放页换集后再收藏（携带 episode）→ 更新为新集
    store.upsertFavorite({ series_id: 's1', title: '剧一', total_episodes: 80, episode: 40 });
    expect(store.listFavorites()[0]).toMatchObject({ episode: 40 });
    // 从未带 episode 的新增 → 默认 1
    store.upsertFavorite({ series_id: 's2', title: '剧二' });
    expect(store.listFavorites().find((r) => r.series_id === 's2')).toMatchObject({ episode: 1 });
    store.close();
  });
});

describe('LocalStore history', () => {
  it('listHistory 按 updated_at 倒序（最近观看在前）', () => {
    const { store, tick } = makeStore();
    store.upsertHistory({ series_id: 's1', title: '一', ep: 1, progress_sec: 30 });
    tick(1000);
    store.upsertHistory({ series_id: 's2', title: '二', ep: 2, progress_sec: 60 });
    tick(1000);
    // s1 再次观看 → updated_at 最新，排到最前
    store.upsertHistory({ series_id: 's1', title: '一', ep: 5, progress_sec: 120 });
    const list = store.listHistory();
    expect(list.map((r) => r.series_id)).toEqual(['s1', 's2']);
    expect(list[0]).toMatchObject({ ep: 5, progress_sec: 120 });
    store.close();
  });

  it('upsert 保留已有 title/cover（新值为空不覆盖旧值）', () => {
    const { store, tick } = makeStore();
    store.upsertHistory({ series_id: 's1', title: '有名', cover: 'cv', ep: 1, progress_sec: 10 });
    tick(100);
    store.upsertHistory({ series_id: 's1', title: '', cover: '', ep: 2, progress_sec: 20 });
    const row = store.getHistory('s1');
    expect(row).toMatchObject({ title: '有名', cover: 'cv', ep: 2, progress_sec: 20 });
    store.close();
  });

  it('removeHistory 删除与幂等', () => {
    const { store } = makeStore();
    store.upsertHistory({ series_id: 's1', ep: 1, progress_sec: 0 });
    expect(store.removeHistory('s1')).toBe(true);
    expect(store.removeHistory('s1')).toBe(false);
    expect(store.getHistory('s1')).toBeUndefined();
    store.close();
  });
});

describe('LocalStore settings', () => {
  it('读写与覆盖', () => {
    const { store } = makeStore();
    expect(store.getSetting('rate')).toBeUndefined();
    store.setSetting('rate', '1.5');
    expect(store.getSetting('rate')).toBe('1.5');
    store.setSetting('rate', '2');
    expect(store.getSetting('rate')).toBe('2');
    store.close();
  });
});
