import { UpstreamError } from './errors';

/**
 * 从 SSR HTML 中提取 `_ROUTER_DATA = {...}` JSON 负载。
 * 实测（2026-10-06）：官方网页版为 Modern.js SSR，数据以内联 `_ROUTER_DATA` 注入，
 * 后随 `; function runWindowFn()...` 等代码，故必须做括号配平扫描而非正则到 </script>。
 * 纯函数，单测可直接喂样本 HTML。
 */
export function extractRouterData(html: string): unknown {
  const marker = /_ROUTER_DATA\s*=\s*/.exec(html);
  if (!marker) {
    throw new UpstreamError('validate', 'upstream html missing _ROUTER_DATA');
  }
  let i = marker.index + marker[0].length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== '{') {
    throw new UpstreamError('validate', '_ROUTER_DATA is not a JSON object');
  }
  const start = i;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        try {
          return JSON.parse(raw);
        } catch (e) {
          throw new UpstreamError('validate', `_ROUTER_DATA JSON.parse failed: ${(e as Error).message}`);
        }
      }
    }
  }
  throw new UpstreamError('validate', '_ROUTER_DATA unbalanced braces');
}
