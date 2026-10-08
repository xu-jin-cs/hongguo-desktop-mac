/**
 * 本地数据层 HTTP 服务（PRD §5，api_contract.json 唯一契约基线）。
 * node:http 实现（依赖最小化，见 DEPS.md 偏离说明）。
 * 统一响应包 {code,msg,data}：0 成功 / 400 参数错 / 404 不存在 / 502 上游异常 / 504 上游超时。
 * HTTP 状态码与 envelope.code 保持一致（成功 200）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { UpstreamClient, UpstreamError, upstreamErrorToCode } from '../upstream';
import { LocalStore } from '../store';
import { MediaService, serveMp4 } from './media';
import {
  ParamError,
  parseBodyInt,
  parseCategoryType,
  parseEp,
  parsePage,
  parseProgressSec,
  parseQuery,
  parseRankBoard,
  parseSeriesId,
  parseSize,
} from './validate';

export interface ServerDeps {
  upstream: UpstreamClient;
  store: LocalStore;
}

interface Envelope {
  code: number;
  msg: string;
  data: unknown;
}

const BODY_LIMIT = 64 * 1024;

export function createRequestHandler(deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { upstream, store } = deps;
  // App 端全集通道（2026-10-06 打通：video_model + spade_a + ffmpeg 解密）
  const media = new MediaService(async (seriesId, ep) => {
    const series = await upstream.getSeries(seriesId);
    const item = series.episodes.find((e) => e.ep === ep);
    if (!item) throw new Error(`第 ${ep} 集不存在`);
    const detailVids = await upstream.getSeriesVids(seriesId);
    const vid = detailVids[ep - 1];
    if (!vid) throw new Error(`第 ${ep} 集无 vid`);
    return vid;
  });

  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // 媒体流路由：/api/media/<series_id>/<ep>.mp4（解密缓存 + Range，不走统一响应包）
    const mediaMatch = /^\/api\/media\/(\d+)\/(\d+)\.mp4$/.exec(path);
    if (mediaMatch) {
      try {
        const file = url.searchParams.get('refresh')
          ? await media.forceRefresh(mediaMatch[1], parseInt(mediaMatch[2], 10))
          : await media.ensureEpisode(mediaMatch[1], parseInt(mediaMatch[2], 10));
        await serveMp4(file, req, res);
        media.prefetchNext(mediaMatch[1], parseInt(mediaMatch[2], 10));
      } catch (err) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 404, msg: err instanceof Error ? err.message : 'media unavailable', data: null }));
      }
      return;
    }

    try {
      const data = await route(method, path, url, req);
      send(res, 200, { code: 0, msg: 'ok', data });
    } catch (e) {
      if (e instanceof ParamError) {
        send(res, 400, { code: 400, msg: e.message, data: null });
      } else if (e instanceof RouteNotFound) {
        send(res, 404, { code: 404, msg: e.message, data: null });
      } else if (e instanceof UpstreamError) {
        const code = upstreamErrorToCode(e);
        send(res, code, { code, msg: e.message, data: null });
      } else {
        send(res, 502, { code: 502, msg: `internal: ${(e as Error).message}`, data: null });
      }
    }
  };

  async function route(method: string, path: string, url: URL, req: IncomingMessage): Promise<unknown> {
    switch (path) {
      case '/api/home': {
        assertMethod(method, 'GET');
        return upstream.getHome(parsePage(url.searchParams.get('page')), parseSize(url.searchParams.get('size')));
      }
      case '/api/category': {
        assertMethod(method, 'GET');
        return upstream.getCategory(
          parseCategoryType(url.searchParams.get('type')),
          parsePage(url.searchParams.get('page')),
          parseSize(url.searchParams.get('size')),
        );
      }
      case '/api/rank': {
        assertMethod(method, 'GET');
        return upstream.getRank(parseRankBoard(url.searchParams.get('board')), parseSize(url.searchParams.get('size')));
      }
      case '/api/search': {
        assertMethod(method, 'GET');
        return upstream.getSearch(
          parseQuery(url.searchParams.get('q')),
          parsePage(url.searchParams.get('page')),
          parseSize(url.searchParams.get('size')),
        );
      }
      case '/api/series': {
        assertMethod(method, 'GET');
        return upstream.getSeries(parseSeriesId(url.searchParams.get('series_id')));
      }
      case '/api/play': {
        assertMethod(method, 'GET');
        const seriesId = parseSeriesId(url.searchParams.get('series_id'));
        const ep = parseEp(url.searchParams.get('ep'));
        // ep 上界校验需要 total_episodes（详情有 10min 缓存，代价低）
        const series = await upstream.getSeries(seriesId);
        if (ep > series.total_episodes) {
          throw new ParamError(`ep 越界 [1,${series.total_episodes}]`);
        }
        try {
          return await upstream.getPlay(seriesId, ep);
        } catch (err) {
          // 官网网页源仅前 accessible_episode_cnt 集（404）→ App 端解密通道兜底（全集）
          if (err instanceof UpstreamError && upstreamErrorToCode(err) === 404) {
            const host = req.headers.host ?? '127.0.0.1';
            return {
              play_url: `http://${host}/api/media/${encodeURIComponent(seriesId)}/${ep}.mp4`,
              duration: 0,
              next_ep: ep < series.total_episodes ? ep + 1 : null,
              prev_ep: ep > 1 ? ep - 1 : null,
              source: 'app_api_decrypted',
            };
          }
          throw err;
        }
      }
      case '/api/favorites':
        return routeFavorites(method, url, req);
      case '/api/watched': {
        assertMethod(method, 'GET');
        const seriesId = parseSeriesId(url.searchParams.get('series_id'));
        return { list: store.listWatched(seriesId) };
      }
      case '/api/history':
        return routeHistory(method, url, req);
      default:
        throw new RouteNotFound(`unknown endpoint: ${method} ${path}`);
    }
  }

  async function routeFavorites(method: string, url: URL, req: IncomingMessage): Promise<unknown> {
    if (method === 'GET') {
      return { list: store.listFavorites() };
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const seriesId = parseSeriesId(body.series_id);
      store.upsertFavorite({
        series_id: seriesId,
        title: optionalString(body.title),
        cover: optionalString(body.cover),
        total_episodes: optionalInt(body.total_episodes),
        // D2 修复：收藏落库携带评分/热度，供 Library 卡片渲染（缺省落 0）
        score: optionalNumber(body.score),
        hot: optionalInt(body.hot),
        // 收藏时所在集（2026-10-06 用户裁定：收藏列表点击跳回该集，缺省落 1）
        episode: optionalInt(body.episode),
      });
      return { list: store.listFavorites() };
    }
    if (method === 'DELETE') {
      const body = await readJsonBody(req, true);
      const seriesId = parseSeriesId(body.series_id ?? url.searchParams.get('series_id'));
      store.removeFavorite(seriesId);
      return { list: store.listFavorites() };
    }
    throw new RouteNotFound(`unknown method: ${method} /api/favorites`);
  }

  async function routeHistory(method: string, url: URL, req: IncomingMessage): Promise<unknown> {
    if (method === 'GET') {
      return { list: store.listHistory() };
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const seriesId = parseSeriesId(body.series_id);
      const ep = parseBodyInt(body.ep, 'ep', { min: 1, max: 100000 });
      const progressSec = parseProgressSec(body.progress_sec);
      store.upsertHistory({
        series_id: seriesId,
        title: optionalString(body.title),
        cover: optionalString(body.cover),
        ep,
        progress_sec: progressSec,
      });
      // 按集观看记录（选集置灰依据；取历史最大进度，回看小进度不覆盖）
      store.upsertWatched({ series_id: seriesId, ep, progress_sec: progressSec });
      return { list: store.listHistory() };
    }
    if (method === 'DELETE') {
      const body = await readJsonBody(req, true);
      const seriesId = parseSeriesId(body.series_id ?? url.searchParams.get('series_id'));
      store.removeHistory(seriesId);
      return { list: store.listHistory() };
    }
    throw new RouteNotFound(`unknown method: ${method} /api/history`);
  }
}

class RouteNotFound extends Error {}

function assertMethod(actual: string, expected: string): void {
  if (actual !== expected) throw new RouteNotFound(`${actual} not allowed`);
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function optionalInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** score 为小数评分（如 9.2），不能用 optionalInt；非负有限 number 才接收。 */
function optionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

async function readJsonBody(req: IncomingMessage, optional = false): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new ParamError('body 过大');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (raw === '') {
    if (optional) return {};
    throw new ParamError('请求体必填 JSON');
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ParamError('请求体必须为 JSON 对象');
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ParamError) throw e;
    throw new ParamError('请求体 JSON 解析失败');
  }
}

function send(res: ServerResponse, httpStatus: number, envelope: Envelope): void {
  // RouteNotFound 统一走 404（在 createRequestHandler 的 catch 前转换）
  res.writeHead(httpStatus, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(envelope));
}

export { RouteNotFound };
