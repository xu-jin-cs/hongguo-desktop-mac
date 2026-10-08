/**
 * dataSource 适配层单测：mock 回落逻辑（硬性要求 §10）。
 * 覆盖：
 *  1. 无窗口环境 / 端口为 0 → 直接回落内置 mock；
 *  2. 端口 >0 但探活网络失败 → 回落 mock；
 *  3. 服务可达且 code=0 → 用真实服务数据，不走 mock；
 *  4. 服务可达但业务错误码（502/400）→ 抛 ApiError，禁止回落 mock。
 *  5. 探活拿到 HTTP 502/504 响应（ok:false 但 fetch 未抛异常）→ 服务可达、上游故障，
 *     不判不可达、不回落 mock，业务请求按契约抛 ApiError。
 *  6. 不可达判定带 30s TTL：到期自动重探测，数据层恢复后切回真实服务。
 * 每个用例 vi.resetModules 重置适配层探活缓存（serviceDown 模块级单例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DataSourceModule = typeof import('../src/renderer/src/api/dataSource');
type TypesModule = typeof import('../src/renderer/src/types');

const localStorageStub = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function installWindow(port: number) {
  vi.stubGlobal('window', {
    __HG_PORT__: port,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    localStorage: localStorageStub,
  });
}

async function loadDataSource(): Promise<DataSourceModule['dataSource']> {
  const mod: DataSourceModule = await import('../src/renderer/src/api/dataSource');
  return mod.dataSource;
}

describe('dataSource 适配层 mock 回落', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('无 window 环境（端口不可知）→ 回落 mock', async () => {
    const ds = await loadDataSource();
    const home = await ds.getHome(1, 20);
    expect(home.list.length).toBeGreaterThan(0);
    expect(home.list[0]).toHaveProperty('series_id');
    expect(ds.isMockMode()).toBe(true);
  });

  it('__HG_PORT__ = 0 → 回落 mock', async () => {
    installWindow(0);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const ds = await loadDataSource();
    const rank = await ds.getRank('hot', 20);
    expect(rank.list[0]?.rank).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled(); // 端口为 0 不发任何请求
    expect(ds.isMockMode()).toBe(true);
  });

  it('端口 >0 但探活网络异常 → 回落 mock', async () => {
    installWindow(58080);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const ds = await loadDataSource();
    const home = await ds.getHome(1, 20);
    expect(home.list.length).toBeGreaterThan(0);
    expect(ds.isMockMode()).toBe(true);
  });

  it('端口 >0 且运行期请求网络异常 → 回落 mock', async () => {
    installWindow(58081);
    // 探活成功（ok），业务请求连接失败
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValue(new Error('socket hang up'));
    vi.stubGlobal('fetch', fetchMock);
    const ds = await loadDataSource();
    const home = await ds.getHome(1, 20);
    expect(home.list.length).toBeGreaterThan(0);
    expect(ds.isMockMode()).toBe(true);
  });

  it('服务可达且 code=0 → 使用真实服务数据', async () => {
    installWindow(58082);
    const payload = {
      code: 0,
      msg: 'ok',
      data: {
        list: [
          {
            series_id: 'real-1',
            title: '真实剧集',
            cover: 'http://127.0.0.1/cover.png',
            hot: 1,
            score: 9.9,
            total_episodes: 3,
            latest_episode: 3,
          },
        ],
        has_more: false,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal('fetch', fetchMock);
    const ds = await loadDataSource();
    const home = await ds.getHome(1, 20);
    expect(home.list).toHaveLength(1);
    expect(home.list[0]?.series_id).toBe('real-1');
    expect(ds.isMockMode()).toBe(false);
  });

  it('服务返回业务错误码 502 → 抛 ApiError，不回落 mock', async () => {
    installWindow(58083);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 502, msg: '上游异常', data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const ds = await loadDataSource();
    // 与 reset 后的 dataSource 同一模块图动态取 ApiError，避免类身份不一致
    const { ApiError } = (await import('../src/renderer/src/types')) as TypesModule;
    await expect(ds.getHome(1, 20)).rejects.toMatchObject({ code: 502 });
    await expect(ds.getHome(1, 20)).rejects.toBeInstanceOf(ApiError);
  });

  it('探活拿到 HTTP 502 响应（ok:false）→ 判定可达、不回落 mock，业务 502 抛 ApiError', async () => {
    installWindow(58084);
    // 探活：fetch 正常返回但 HTTP 状态 502（服务可达、上游故障）
    // 业务请求：同样 502，envelope 按契约 {code:502}
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ code: 502, msg: '上游异常', data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const ds = await loadDataSource();
    await expect(ds.getHome(1, 20)).rejects.toMatchObject({ code: 502 });
    // 关键断言：502 不得被误判为"服务不可达"，禁止静默回落 mock
    expect(ds.isMockMode()).toBe(false);
    const home = await ds.getHome(1, 20).catch(() => null);
    expect(home).toBeNull();
    // mock 首页第一项 series_id 为 s1；若错误回落 mock 则此处会拿到 mock 数据
    expect(fetchMock).toHaveBeenCalled();
  });

  it('服务不可达带 TTL：30s 后自动重探测，数据层恢复可切回真实服务', async () => {
    installWindow(58085);
    const payload = {
      code: 0,
      msg: 'ok',
      data: { list: [], has_more: false },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED')) // 首次探活：网络失败
      .mockResolvedValue({ ok: true, json: async () => payload }); // 重探测起：恢复
    vi.stubGlobal('fetch', fetchMock);
    const ds = await loadDataSource();
    const home1 = await ds.getHome(1, 20);
    expect(home1.list.length).toBeGreaterThan(0); // mock 数据
    expect(ds.isMockMode()).toBe(true);

    // TTL 内不重探测：仍回落 mock
    await ds.getHome(1, 20);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 推进 31s：TTL 到期 → 重探测 → 恢复后使用真实服务数据
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    try {
      const home2 = await ds.getHome(1, 20);
      expect(home2.list).toHaveLength(0); // 真实服务 payload（空列表）
      expect(ds.isMockMode()).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('mock 模式下搜索空关键词 → 抛 ApiError(400)（契约口径与真实服务一致）', async () => {
    installWindow(0);
    const ds = await loadDataSource();
    await expect(ds.search('', 1, 20)).rejects.toMatchObject({ code: 400 });
    await expect(ds.search('x'.repeat(51), 1, 20)).rejects.toMatchObject({ code: 400 });
  });

  it('mock 模式下 ep 越界 → 抛 ApiError(400)；未存在剧集 → 404', async () => {
    installWindow(0);
    const ds = await loadDataSource();
    await expect(ds.getPlay('s1', 0)).rejects.toMatchObject({ code: 400 });
    await expect(ds.getSeries('no-such-id')).rejects.toMatchObject({ code: 404 });
  });
});
