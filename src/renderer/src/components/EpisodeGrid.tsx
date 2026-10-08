import type { Episode } from '../types';

/**
 * 选集栅格（interaction §3：ep-btn 64×36 gap8 每行≤13；ui_spec §6.4 七态）
 * - playable=false → 禁用置灰 + 删除线 + tooltip「暂不可播」
 * - watchedEp → 观看进度标记（底部 12×2 accent 条）
 */
export function EpisodeGrid({
  episodes,
  currentEp,
  watchedEp,
  watchedEps,
  onSelect,
}: {
  episodes: Episode[];
  currentEp?: number;
  watchedEp?: number;
  /** 已看过的集数集合（置灰区分；2026-10-06 用户需求） */
  watchedEps?: ReadonlySet<number>;
  onSelect: (ep: number) => void;
}) {
  if (episodes.length === 0) {
    return <div className="ep-empty">暂无可选集数</div>;
  }
  return (
    <div className="ep-grid">
      {episodes.map((e) => (
        <button
          key={e.ep}
          type="button"
          data-testid="ep-btn"
          className={[
            'ep-btn',
            currentEp === e.ep ? 'is-current' : '',
            watchedEp === e.ep && currentEp !== e.ep ? 'is-watched' : '',
            watchedEps?.has(e.ep) && currentEp !== e.ep ? 'is-seen' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!e.playable}
          data-tip={!e.playable ? 'App 独占（官方网页源仅前3集）' : undefined}
          onClick={() => onSelect(e.ep)}
        >
          {e.ep}
        </button>
      ))}
    </div>
  );
}
