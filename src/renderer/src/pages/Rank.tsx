import { useState } from 'react';
import { dataSource } from '../api/dataSource';
import { formatHot } from '../components/SeriesCard';
import { FireIcon } from '../components/Icons';
import { EmptyView, ErrorView, SkeletonRows } from '../components/StateView';
import { useFetch } from '../hooks';
import { navigate } from '../router';
import type { RankBoard } from '../types';

const BOARDS: Array<{ key: RankBoard; label: string }> = [
  { key: 'hot', label: '热度榜' },
  { key: 'new', label: '新剧榜' },
  { key: 'real', label: '真人榜' },
  { key: 'comic', label: '漫剧榜' },
];

/** Rank：榜选择 h44 + 排名行 h88（名次 w40 + 封面 64×88 + 信息） */
export function RankPage() {
  const [board, setBoard] = useState<RankBoard>('hot');
  const { status, data, error, failCount, retry } = useFetch(
    () => dataSource.getRank(board, 50),
    [board],
  );
  const list = data?.list ?? [];

  return (
    <div className="page page-rank">
      <div className="tab-bar">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`tab-item${board === b.key ? ' is-active' : ''}`}
            onClick={() => setBoard(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div style={{ height: 'var(--space-5)' }} />
      {status === 'loading' && <SkeletonRows />}
      {status === 'error' && (
        <ErrorView code={error?.code} failCount={failCount} onRetry={retry} retrying={false} />
      )}
      {status === 'empty' && <EmptyView />}
      {status === 'normal' &&
        (list.length === 0 ? (
          <EmptyView />
        ) : (
          <div className="rank-list">
            {list.map((s, i) => {
              const rankNo = s.rank ?? i + 1;
              return (
                <div
                  key={s.series_id}
                  className="rank-row"
                  data-testid="series-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`#/detail/${encodeURIComponent(s.series_id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`#/detail/${encodeURIComponent(s.series_id)}`);
                  }}
                >
                  <div className={`rank-no${rankNo <= 3 ? ` rank-${rankNo}` : ''}`}>{rankNo}</div>
                  <div className="rank-cover">
                    {s.cover ? <img src={s.cover} alt={s.title} loading="lazy" /> : null}
                  </div>
                  <div className="rank-info">
                    <div className="rank-title">{s.title}</div>
                    <div className="rank-meta">
                      {formatHot(s.hot) && (
                        <span className="hot">
                          <FireIcon size={13} />
                          {formatHot(s.hot)}
                        </span>
                      )}
                      {s.score > 0 && <span className="score">{s.score.toFixed(1)}分</span>}
                      <span>全{s.total_episodes}集</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
