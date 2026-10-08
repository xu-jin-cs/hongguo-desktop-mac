import { useState } from 'react';
import type { SeriesCard as SeriesCardData } from '../types';
import { EmptyBoxIcon, ErrorCircleIcon, FireIcon } from './Icons';

export function formatHot(hot: number | null | undefined): string {
  if (hot === null || hot === undefined || !Number.isFinite(hot) || hot <= 0) return '';
  if (hot >= 10000) return `${(hot / 10000).toFixed(1)}万`;
  return String(hot);
}

/** D2 修复：收藏数据可能缺 score（旧库/缺字段），空值防护防整树白屏 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score) || score <= 0) return '';
  return score.toFixed(1);
}

/**
 * 剧集卡片（ui_spec §6.3：w168 / 封面 168×224 radius-3 / 悬浮上浮 2px + shadow-2）
 * 封面四态：loading 骨架 / 正常 / URL 为空占位 / 加载失败（点击封面重试）。
 */
export function SeriesCard({
  item,
  onOpen,
}: {
  item: SeriesCardData;
  onOpen: (seriesId: string) => void;
}) {
  const [coverState, setCoverState] = useState<'loading' | 'ok' | 'empty' | 'error'>(
    item.cover ? 'loading' : 'empty',
  );
  const [reloadKey, setReloadKey] = useState(0);

  const open = () => onOpen(item.series_id);

  return (
    <div
      className="series-card"
      data-testid="series-card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="card-cover">
        {coverState === 'loading' && <div className="skeleton" style={{ width: '100%', height: '100%' }} />}
        {item.cover && coverState !== 'empty' && coverState !== 'error' && (
          <img
            key={reloadKey}
            src={item.cover}
            alt={item.title}
            loading="lazy"
            onLoad={() => setCoverState('ok')}
            onError={() => setCoverState('error')}
            style={coverState === 'loading' ? { visibility: 'hidden', position: 'absolute', inset: 0 } : undefined}
          />
        )}
        {coverState === 'empty' && (
          <div className="cover-fallback">
            <EmptyBoxIcon size={32} />
            暂无封面
          </div>
        )}
        {coverState === 'error' && (
          <div
            className="cover-fallback error"
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setCoverState('loading');
              setReloadKey((k) => k + 1);
            }}
          >
            <ErrorCircleIcon size={24} />
            加载失败
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-meta">
          {formatHot(item.hot) && (
            <span className="meta-hot">
              <FireIcon size={13} />
              {formatHot(item.hot)}
            </span>
          )}
          {formatScore(item.score) && <span className="meta-score">{formatScore(item.score)}</span>}
          <span className="meta-eps">{item.total_episodes ?? 0}集</span>
        </div>
      </div>
    </div>
  );
}
