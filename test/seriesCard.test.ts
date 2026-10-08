/**
 * SeriesCard 空值防护单测（D2 修复回归）：
 * - formatScore/formatHot 对缺失/非法值不抛错，回落占位符 '—'
 * - 缺 score/hot 的收藏数据渲染整卡不抛错（防 Library 页整树白屏）
 * node 环境无 DOM，用 react-dom/server renderToString 做纯渲染断言。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { formatHot, formatScore, SeriesCard } from '../src/renderer/src/components/SeriesCard';
import type { SeriesCard as SeriesCardData } from '../src/renderer/src/types';

describe('SeriesCard 空值防护（D2）', () => {
  it('formatScore: 缺失/0/非法返回空串(渲染隐藏); 正常保留1位小数', () => {
    expect(formatScore(undefined)).toBe('');
    expect(formatScore(null)).toBe('');
    expect(formatScore(NaN)).toBe('');
    expect(formatScore(9.24)).toBe('9.2');
    expect(formatScore(0)).toBe('');
  });

  it('formatHot: 缺失/0/非法返回空串(渲染隐藏); 万级格式化不变', () => {
    expect(formatHot(undefined)).toBe('');
    expect(formatHot(null)).toBe('');
    expect(formatHot(NaN)).toBe('');
    expect(formatHot(12345)).toBe('1.2万');
    expect(formatHot(999)).toBe('999');
  });

  it('缺 score/hot 的收藏数据渲染不抛错，评分位隐藏', () => {
    // 模拟旧库/缺字段收藏行：无 score/hot 字段
    const item = {
      series_id: 's1',
      title: '缺评分剧',
      cover: '',
      total_episodes: 3,
    } as unknown as SeriesCardData;
    const htmlOutput = renderToString(createElement(SeriesCard, { item, onOpen: () => undefined }));
    expect(htmlOutput).not.toContain('—');
    expect(htmlOutput).toContain('缺评分剧');
  });
});
