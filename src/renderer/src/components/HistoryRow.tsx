import { useEffect, useState } from 'react';
import { dataSource } from '../api/dataSource';
import type { HistoryItem } from '../types';
import { WarnIcon } from './Icons';

/**
 * 历史行（ui_spec §6.8：h72 / 封面 40×56 / 副文案「看到第N集 · xx%」/ 悬浮浮出「续播」）
 * 百分比 = progress_sec / 该集时长（时长经 /api/series 取，dataSource 带 10min 内存缓存）。
 * progress_sec 数据异常（非有限数）→ 副文案「进度异常」+ 点击按 ep=1 progress=0 进入。
 */
export function HistoryRow({
  item,
  onResume,
}: {
  item: HistoryItem;
  onResume: (seriesId: string, ep: number) => void;
}) {
  const abnormal = !Number.isFinite(item.progress_sec);
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (abnormal) return;
    let cancelled = false;
    dataSource
      .getSeries(item.series_id)
      .then((detail) => {
        if (cancelled) return;
        const epInfo = detail.episodes.find((e) => e.ep === item.ep);
        if (epInfo && epInfo.duration > 0) {
          setPct(Math.min(100, Math.round((item.progress_sec / epInfo.duration) * 100)));
        }
      })
      .catch(() => {
        /* 详情拉取失败：退化为不显示百分比 */
      });
    return () => {
      cancelled = true;
    };
  }, [abnormal, item.ep, item.progress_sec, item.series_id]);

  const resume = () => onResume(item.series_id, abnormal ? 1 : item.ep);

  return (
    <div
      className="history-item"
      data-testid="history-item"
      role="button"
      tabIndex={0}
      onClick={resume}
      onKeyDown={(e) => {
        if (e.key === 'Enter') resume();
      }}
    >
      <div className="history-cover">
        {item.cover ? <img src={item.cover} alt={item.title} loading="lazy" /> : null}
      </div>
      <div className="history-info">
        <div className="history-title">
          {abnormal && (
            <span style={{ color: 'var(--state-warning)', marginRight: 6, display: 'inline-flex' }}>
              <WarnIcon size={12} />
            </span>
          )}
          {item.title}
        </div>
        <div className={`history-sub${abnormal ? ' warn' : ''}`}>
          {abnormal
            ? '进度异常'
            : `看到第${item.ep}集${pct !== null ? ` · ${pct}%` : ''}`}
        </div>
      </div>
      <button
        type="button"
        className="history-resume"
        onClick={(e) => {
          e.stopPropagation();
          resume();
        }}
      >
        续播
      </button>
    </div>
  );
}
