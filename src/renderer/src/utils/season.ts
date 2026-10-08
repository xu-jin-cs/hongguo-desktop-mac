/**
 * 季数解析与跨季连播（PRD v1.3：本季末集播完自动跳下一季第1集）。
 * 支持「第N季」（阿拉伯/中文数字）与「Season N / S N」两种写法。
 */

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

export interface SeasonInfo {
  base: string;
  season: number | null;
}

function parseCnSeason(cn: string): number | null {
  if (/^\d+$/.test(cn)) return parseInt(cn, 10);
  if (cn in CN_NUM) return CN_NUM[cn];
  // 十一/二十/二十三 等简单中文数字
  const m = cn.match(/^(?:(十)|([一二三四五六七八九])十)([一二三四五六七八九])?$/);
  if (m) {
    const tens = m[1] ? 10 : CN_NUM[m[2]!] * 10;
    const ones = m[3] ? CN_NUM[m[3]] : 0;
    return tens + ones;
  }
  return null;
}

export function parseSeason(title: string): SeasonInfo {
  if (!title) return { base: '', season: null };
  let m = title.match(/^(.*?)(?:第\s*([0-9一二三四五六七八九十两]+)\s*季)(.*)$/);
  if (m) {
    const season = parseCnSeason(m[2]);
    if (season !== null) {
      return { base: (m[1] + m[3]).replace(/[\s:：\-—·]+/g, ' ').trim(), season };
    }
  }
  m = title.match(/^(.*?)(?:season\s*(\d+)|s(\d+))(.*)$/i);
  if (m) {
    const season = parseInt(m[2] ?? m[3], 10);
    return { base: (m[1] + m[4]).replace(/[\s:：\-—·]+/g, ' ').trim(), season };
  }
  return { base: title.trim(), season: null };
}

/** 在搜索结果中找下一季：同 base 且 season === 当前+1 */
export function findNextSeason<T extends { title: string; series_id: string }>(
  currentTitle: string,
  candidates: T[],
): T | null {
  const cur = parseSeason(currentTitle);
  if (cur.season === null || !cur.base) return null;
  const norm = (s: string) => s.replace(/[\s:：\-—·]+/g, '').toLowerCase();
  for (const c of candidates) {
    const info = parseSeason(c.title);
    if (info.season === cur.season + 1 && norm(info.base) === norm(cur.base)) return c;
  }
  return null;
}
