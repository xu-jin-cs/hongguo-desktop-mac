/**
 * 参数校验（api_contract.json + interaction_design.md §10 字段约束表）。
 * 纯函数；非法抛 ParamError → server 映射 400。
 * progress_sec 例外：越界不报错，截断（clamp）至 [0, 86400]（契约"越界截断"）。
 */
import type { CategoryType, RankBoard } from '../upstream/types';

export class ParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParamError';
  }
}

const CATEGORY_TYPES = new Set<string>(['real', 'comic', 'ai', 'manga']);
const RANK_BOARDS = new Set<string>(['hot', 'new', 'real', 'comic']);

export const PROGRESS_SEC_MAX = 86400;

/** int 解析：非整数/越界 → ParamError。 */
export function parseIntParam(
  raw: string | null,
  name: string,
  opts: { min: number; max: number; default?: number },
): number {
  if (raw === null || raw === '') {
    if (opts.default !== undefined) return opts.default;
    throw new ParamError(`${name} 必填`);
  }
  if (!/^-?\d+$/.test(raw)) throw new ParamError(`${name} 必须为整数`);
  const v = Number(raw);
  if (v < opts.min || v > opts.max) throw new ParamError(`${name} 越界 [${opts.min},${opts.max}]`);
  return v;
}

export function parsePage(raw: string | null): number {
  return parseIntParam(raw, 'page', { min: 1, max: 10000, default: 1 });
}

export function parseSize(raw: string | null): number {
  return parseIntParam(raw, 'size', { min: 1, max: 50, default: 20 });
}

export function parseCategoryType(raw: string | null): CategoryType {
  if (raw === null || !CATEGORY_TYPES.has(raw)) {
    throw new ParamError(`type 非法枚举（允许 real|comic|ai|manga）`);
  }
  return raw as CategoryType;
}

export function parseRankBoard(raw: string | null): RankBoard {
  if (raw === null || !RANK_BOARDS.has(raw)) {
    throw new ParamError(`board 非法枚举（允许 hot|new|real|comic）`);
  }
  return raw as RankBoard;
}

/** q：必填，trim 后 1-50 字。 */
export function parseQuery(raw: string | null): string {
  if (raw === null) throw new ParamError('q 必填');
  const q = raw.trim();
  if (q.length < 1 || q.length > 50) throw new ParamError('q 需为 1-50 字');
  return q;
}

export function parseSeriesId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new ParamError('series_id 必填');
  return raw.trim();
}

/** ep 基础校验（≥1 整数）；上界 total_episodes 由 server 查详情后二次校验。 */
export function parseEp(raw: string | null): number {
  return parseIntParam(raw, 'ep', { min: 1, max: 100000 });
}

/** progress_sec：非整数 → ParamError；数值越界 → 截断到 [0,86400]（契约"截断"语义）。 */
export function parseProgressSec(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    if (typeof raw === 'string' && /^-?\d+$/.test(raw)) {
      return clampProgress(Number(raw));
    }
    throw new ParamError('progress_sec 必须为整数');
  }
  if (!Number.isInteger(raw)) throw new ParamError('progress_sec 必须为整数');
  return clampProgress(raw);
}

/**
 * body 数值参数解析（A01-E11：与 query 的 parseIntParam 同源，禁止两套校验漂移）。
 * body 值是 JSON 类型（number），query 值是字符串，入口形态不同、判定逻辑同一份。
 */
export function parseBodyInt(raw: unknown, name: string, opts: { min: number; max: number }): number {
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) {
    return parseIntParam(raw, name, opts);
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < opts.min || raw > opts.max) {
    throw new ParamError(`${name} 必须为 [${opts.min},${opts.max}] 整数`);
  }
  return raw;
}

function clampProgress(v: number): number {
  return Math.min(PROGRESS_SEC_MAX, Math.max(0, v));
}
