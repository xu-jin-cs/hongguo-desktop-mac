import { describe, expect, it } from 'vitest';
import { findNextSeason, parseSeason } from '../src/renderer/src/utils/season';

describe('parseSeason 季数解析', () => {
  it('阿拉伯数字季', () => {
    expect(parseSeason('万妖图录传第十三季')).toEqual({ base: '万妖图录传', season: 13 });
    expect(parseSeason('凡人百世书第八季')).toEqual({ base: '凡人百世书', season: 8 });
  });
  it('中文数字季', () => {
    expect(parseSeason('重生！丑小鸭逆袭成了万人迷第三季').base).toBe('重生！丑小鸭逆袭成了万人迷');
  });
  it('无季标记', () => {
    expect(parseSeason('帐中香')).toEqual({ base: '帐中香', season: null });
  });
});

describe('findNextSeason 跨季连播', () => {
  const list = [
    { series_id: 's14', title: '万妖图录传第十四季' },
    { series_id: 's12', title: '万妖图录传第十二季' },
    { series_id: 'x1', title: '凡人修仙传' },
  ];
  it('命中下一季', () => {
    expect(findNextSeason('万妖图录传第十三季', list)?.series_id).toBe('s14');
  });
  it('无下一季返回 null', () => {
    expect(findNextSeason('万妖图录传第十四季', list)).toBeNull();
  });
  it('当前剧无季标记返回 null', () => {
    expect(findNextSeason('凡人修仙传', list)).toBeNull();
  });
});
