import { useState } from 'react';
import { dataSource } from '../api/dataSource';
import { SeriesCard } from '../components/SeriesCard';
import { EmptyView, ErrorView, SkeletonGrid } from '../components/StateView';
import { usePagedList } from '../hooks';
import { navigate } from '../router';
import type { CategoryType } from '../types';

const TABS: Array<{ key: CategoryType; label: string }> = [
  { key: 'real', label: '真人剧' },
  { key: 'comic', label: '漫剧' },
  { key: 'ai', label: 'AI剧' },
  { key: 'manga', label: '漫画' },
];

/** Category：顶部 tab 条 h44（真人剧/漫剧/AI剧/漫画）+ 栅格分页 */
export function CategoryPage() {
  const [type, setType] = useState<CategoryType>('real');
  const { status, items, error, failCount, hasMore, loadingMore, loadMore, retry } =
    usePagedList((page) => dataSource.getCategory(type, page, 20), [type]);

  return (
    <div className="page page-category">
      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab-item${type === t.key ? ' is-active' : ''}`}
            onClick={() => setType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ height: 'var(--space-5)' }} />
      {status === 'loading' && <SkeletonGrid />}
      {status === 'error' && (
        <ErrorView code={error?.code} failCount={failCount} onRetry={retry} retrying={false} />
      )}
      {status === 'empty' && <EmptyView />}
      {status === 'normal' && (
        <>
          <div className="card-grid">
            {items.map((s) => (
              <SeriesCard
                key={s.series_id}
                item={s}
                onOpen={(id) => navigate(`#/detail/${encodeURIComponent(id)}`)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="load-more-wrap">
              <button
                type="button"
                className="load-more-btn"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
