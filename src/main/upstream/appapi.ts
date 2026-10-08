/**
 * 红果 App 端原生接口适配（借鉴 wx2cyj/HGDJ 与 zhoufuweigg/guoapp 公开实现，2026-10-06 实测打通）。
 * 用途：官网网页版仅放开前 3 集（player 路由 404），App 端 video_model/v1 可取全集 cenc-aes-ctr 流 + spade_a。
 * 关键点：X-Gorgon 第二轮变换必须【就地】写入（i=19 依赖 i=0 变换后的值）——异地数组会在末字节出错，
 * 宽松端点（landpage）不校验、播放端点严格校验返回 110001（本次攻坚实测定位）。
 */
import { createHash, randomInt } from 'node:crypto';

const SIGN_KEY = Buffer.from([
  0x44, 0xb9, 0xb9, 0xd9, 0xa4, 0xae, 0xf9, 0xfc,
  0xa4, 0x93, 0xaa, 0x75, 0x7c, 0xa3, 0xc2, 0xc4,
  0xa4, 0x96, 0x93, 0x8f,
]);

const APP_BASE = 'https://api5-normal-sinfonlineb.fqnovel.com';
const APP_UA =
  'com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)';

function rotl8(v: number, n: number): number {
  return ((v << n) | (v >> (8 - n))) & 0xff;
}

function rev8(v: number): number {
  let r = 0;
  for (let i = 0; i < 8; i++) r = (r << 1) | ((v >> i) & 1);
  return r;
}

function popcount(n: number): number {
  let c = 0;
  while (n) { c += n & 1; n >>= 1; }
  return c;
}

export interface SignedHeaders {
  'X-Gorgon': string;
  'X-Khronos': string;
  'X-SS-Req-Ticket': string;
  'X-SS-STUB'?: string;
}

export function signRequest(queryString: string, body: Buffer | null, nowSec: number): SignedHeaders {
  const payload = Buffer.alloc(20);
  createHash('md5').update(queryString).digest().copy(payload, 0, 0, 4);
  const headers: SignedHeaders = {
    'X-Gorgon': '',
    'X-Khronos': String(nowSec),
    'X-SS-Req-Ticket': String(Date.now()),
  };
  if (body) {
    const bh = createHash('md5').update(body).digest();
    bh.copy(payload, 4, 0, 4);
    headers['X-SS-STUB'] = bh.toString('hex').toUpperCase();
  }
  payload[12] = 0; payload[13] = 6; payload[14] = 11; payload[15] = 28;
  payload.writeUInt32BE(nowSec >>> 0, 16);
  for (let i = 0; i < 20; i++) payload[i] ^= SIGN_KEY[i];
  // 就地变换（勿改异地数组，见文件头注释）
  for (let i = 0; i < 20; i++) {
    payload[i] = rev8(rotl8(payload[i], 4) ^ payload[(i + 1) % 20]) ^ 0xff ^ 20;
  }
  headers['X-Gorgon'] = Buffer.concat([Buffer.from([0x84, 0x04, 0x40, 0x1c, 0, 0]), payload]).toString('hex');
  return headers;
}

function newDeviceId(): string {
  // 19 位数字设备 id（避开 Number.MAX_SAFE_INTEGER≈9.007e15 限制，逐位拼接）
  let s = '7';
  for (let i = 0; i < 18; i++) s += String(randomInt(0, 10));
  return s;
}

function baseQuery(): Record<string, string> {
  const did = newDeviceId();
  return {
    aid: '8662', app_name: 'novelread',
    version_code: '73532', version_name: '7.3.5.32',
    manifest_version_code: '73532', update_version_code: '73532',
    channel: 'update_64', device_platform: 'android',
    os: 'android', ssmix: 'a', device_type: '25053RT47C',
    device_brand: 'Redmi', language: 'zh',
    os_api: '36', os_version: '16',
    resolution: '1280*2772', dpi: '520', ac: 'wifi',
    device_id: did, iid: did,
  };
}

export interface AppMediaStream {
  main_url: string;
  backup_url?: string;
  definition: string;
  codec: string;
  spade_a: string;
}

export async function getVideoModel(vid: string): Promise<AppMediaStream[]> {
  const now = Math.floor(Date.now() / 1000);
  const q = baseQuery();
  q._rticket = String(Date.now());
  const qs = new URLSearchParams(q).toString();
  const body = Buffer.from(JSON.stringify({
    video_id: vid, content_type: 1,
    biz_param: { need_all_video_definition: true, video_platform: 3 },
  }));
  const sig = signRequest(qs, body, now);
  const res = await fetch(`${APP_BASE}/novel/player/video_model/v1/?${qs}`, {
    method: 'POST',
    headers: {
      'User-Agent': APP_UA,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'X-XS-From-Web': '0',
      'Sdk-Version': '2',
      ...sig,
    },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const raw = await res.text();
  if (!raw) throw new Error('video_model 空响应（风控）');
  const j = JSON.parse(raw);
  if (j.code !== 0 && j.Code !== 0) {
    throw new Error(`video_model 失败: ${j.message || j.Message || j.Code}`);
  }
  let vm = j.data?.video_model;
  if (typeof vm === 'string') vm = JSON.parse(vm);
  let vl = vm?.video_list ?? [];
  if (!Array.isArray(vl)) vl = Object.values(vl);
  const out: AppMediaStream[] = [];
  for (const v of vl as Array<Record<string, unknown>>) {
    const meta = (v.video_meta ?? {}) as Record<string, unknown>;
    const ei = (v.encrypt_info ?? {}) as Record<string, unknown>;
    const codec = String(meta.codec_type ?? '');
    if (codec === 'bytevc2') continue; // 不兼容编码（HGDJ/guoapp 同策略）
    const mainUrl = String(v.main_url ?? '');
    if (!mainUrl) continue;
    out.push({
      main_url: mainUrl,
      backup_url: v.backup_url ? String(v.backup_url) : undefined,
      definition: String(meta.definition ?? ''),
      codec,
      spade_a: String(ei.spade_a ?? ''),
    });
  }
  return out;
}

/** spade_a → 16 字节 AES-128 密钥（hex 32 字符），算法复刻 HGDJ hongguo_content_key */
export function deriveContentKey(spadeA: string): string {
  const raw = Buffer.from(spadeA, 'base64');
  if (raw.length < 3) throw new Error('spade_a 编码无效');
  const tagLen = (raw[0] ^ raw[1] ^ raw[2]) - 48;
  const contentLen = raw.length - tagLen - 1;
  if (tagLen < 1 || contentLen < 33 || contentLen >= raw.length) throw new Error('spade_a 结构无效');
  const seed = raw[raw.length - tagLen - 2] ^ raw[raw.length - tagLen - 1];
  let tag = '';
  for (let i = 0; i < tagLen; i++) tag += String.fromCharCode(raw[raw.length - tagLen + i] ^ seed);
  if (tag === 'app_v2' || tag === 'web_v2') throw new Error(`spade_a 版本暂不支持: ${tag}`);
  const decoded = Buffer.alloc(contentLen);
  let prevEven = 250, prevOdd = 85;
  for (let i = 0; i < contentLen; i++) {
    const cur = raw[1 + i];
    let prev: number;
    if (i % 2 === 0) { prev = prevEven; prevEven = cur; } else { prev = prevOdd; prevOdd = cur; }
    decoded[i] = (prev ^ cur) - 21 - popcount(i);
  }
  const padding = parseInt(String.fromCharCode(decoded[0]), 36);
  if (Number.isNaN(padding) || contentLen - padding - 1 !== 32) throw new Error('spade_a 内容无效');
  return decoded.subarray(1, 33).toString('utf8');
}

/** 选流：优先 720p，缺失则取最高清晰度 */
export function pickStream(streams: AppMediaStream[], prefer = '720p'): AppMediaStream | null {
  if (streams.length === 0) return null;
  const num = (d: string) => parseInt(d.replace(/\D/g, ''), 10) || 0;
  const sorted = [...streams].sort((a, b) => num(a.definition) - num(b.definition));
  const exact = sorted.find((s) => s.definition === prefer);
  return exact ?? sorted[sorted.length - 1];
}
