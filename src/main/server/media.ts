/**
 * 本地媒体服务：App 端加密流（cenc-aes-ctr）→ ffmpeg -decryption_key 解密 → 缓存 → Range 服务。
 * 借鉴 wx2cyj/HGDJ 的链路（video_model → spade_a → AES-128 key → ffmpeg 解密封装）。
 * 依赖：系统 ffmpeg（打包/运行环境需可执行 `ffmpeg`）。
 */
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getVideoModel, deriveContentKey, pickStream } from '../upstream/appapi';

const CACHE_ROOT = path.join(os.homedir(), '.hongguo-desktop', 'cache');

export interface MediaJob {
  file: string;
  ready: Promise<string>; // resolve=可服务文件路径
}

const inflight = new Map<string, Promise<string>>();

export class MediaService {
  constructor(private resolveVid: (seriesId: string, ep: number) => Promise<string>) {}

  /** 入口：拿到某集的可服务 mp4（解密完成返回文件路径；同集去重） */
  ensureEpisode(seriesId: string, ep: number): Promise<string> {
    const file = path.join(CACHE_ROOT, seriesId, `ep${ep}.mp4`);
    const key = `${seriesId}/${ep}`;
    if (fs.existsSync(file) && fs.statSync(file).size > 10240) {
      // 缓存完整性校验：ffprobe 探测失败（上次中断/损坏）→ 删除重解，杜绝坏缓存永久黑屏
      return probeOk(file).then((ok) => {
        if (ok) return file;
        fs.rmSync(file, { force: true });
        return this.enqueueDecrypt(seriesId, ep, file, key);
      });
    }
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    return this.enqueueDecrypt(seriesId, ep, file, key);
  }

  /** 强制重解（渲染层播放失败重试时调用：删缓存重来） */
  async forceRefresh(seriesId: string, ep: number): Promise<string> {
    const file = path.join(CACHE_ROOT, seriesId, `ep${ep}.mp4`);
    fs.rmSync(file, { force: true });
    inflight.delete(`${seriesId}/${ep}`);
    return this.ensureEpisode(seriesId, ep);
  }

  private enqueueDecrypt(seriesId: string, ep: number, file: string, key: string): Promise<string> {
    if (inflight.has(key)) return inflight.get(key)!;
    const p = this.decryptToFile(seriesId, ep, file)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** 后台预取下一集（连播体验，失败静默） */
  prefetchNext(seriesId: string, ep: number): void {
    this.ensureEpisode(seriesId, ep + 1).catch(() => undefined);
  }

  private async decryptToFile(seriesId: string, ep: number, file: string): Promise<string> {
    const vid = await this.resolveVid(seriesId, ep);
    let lastErr: unknown = null;
    const streams = await getVideoModel(vid);
    // 多档流回退：按清晰度从高到低逐个尝试（某档 CDN 链接失效/损坏时自动换档）
    const num = (d: string) => parseInt(d.replace(/\D/g, ''), 10) || 0;
    const candidates = [...streams].sort((a, b) => num(b.definition) - num(a.definition));
    const preferred = pickStream(streams, '720p');
    const ordered = preferred ? [preferred, ...candidates.filter((c) => c !== preferred)] : candidates;
    if (ordered.length === 0) throw new Error(`第 ${ep} 集无可用媒体流`);
    for (const stream of ordered.slice(0, 3)) {
      try {
        const key = deriveContentKey(stream.spade_a);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.part`;
        await runFfmpeg(stream.main_url, key, tmp);
        // 完整性校验：解密产物必须非空（CDN 截断/空流直接判失败换档）
        const st = await fsp.stat(tmp);
        if (st.size < 10240) throw new Error(`解密产物过小(${st.size}B)，视为不完整`);
        if (!(await probeOk(tmp))) throw new Error('解密产物 ffprobe 探测失败');
        await fsp.rename(tmp, file);
        return file;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

function probeOk(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ffprobePath) ffprobePath = resolveBin(FFPROBE_CANDIDATES, null);
    execFile(ffprobePath!, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { timeout: 15000 }, (err, stdout) => {
      if (err) { resolve(false); return; }
      try {
        const d = JSON.parse(stdout);
        resolve(Number(d?.format?.duration) > 0);
      } catch { resolve(false); }
    });
  });
}

// GUI 直启（Finder/程序坞）的 PATH 不含 /opt/homebrew/bin，必须按绝对路径探测 ffmpeg
const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg'];
const FFPROBE_CANDIDATES = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe', 'ffprobe'];
let ffmpegPath: string | null = null;
let ffprobePath: string | null = null;

function resolveBin(candidates: string[], cached: string | null): string | null {
  if (cached) return cached;
  if (process.env.HG_FFMPEG && candidates[0] === '/opt/homebrew/bin/ffmpeg') return process.env.HG_FFMPEG;
  for (const c of candidates) {
    if (c.includes('/') && fs.existsSync(c)) return c;
  }
  return candidates[candidates.length - 1]; // 兜底裸命令名（PATH 内有则用）
}

function runFfmpeg(url: string, keyHex: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-headers', 'Referer: https://novel.snssdk.com/',
      '-decryption_key', keyHex,
      '-i', url,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      out,
    ];
    if (!ffmpegPath) ffmpegPath = resolveBin(FFMPEG_CANDIDATES, null);
    const proc = spawn(ffmpegPath!, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 解密失败(code=${code}): ${err.slice(-300)}`));
    });
    proc.on('error', (e) => reject(new Error(`ffmpeg 不可用: ${e.message}（需要系统安装 ffmpeg）`)));
  });
}

/** Range 服务（<video> 拖进度条必需 206） */
export async function serveMp4(
  file: string,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  const stat = await fsp.stat(file);
  const range = req.headers.range;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || end < start) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(file).pipe(res);
}
