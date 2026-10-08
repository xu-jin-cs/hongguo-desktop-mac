import { useEffect, useRef } from 'react';
import { dataSource } from '../api/dataSource';
import { SeriesCard } from '../components/SeriesCard';
import { EmptyView, ErrorView, SkeletonGrid } from '../components/StateView';
import { SearchIcon } from '../components/Icons';
import { usePagedList } from '../hooks';
import { navigate } from '../router';

/** 滚动到底自动加载下一页 */
function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cbRef.current();
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return <div ref={ref} style={{ height: 1 }} />;
}

/** Home：顶部搜索占位入口（点击跳 Search）+ 推荐栅格滚动分页（interaction §3） */
export function HomePage() {
  const { status, items, error, failCount, hasMore, loadingMore, loadMore, retry } =
    usePagedList((page) => dataSource.getHome(page, 20), []);

  return (
    <div className="page page-home">
      <div
        className="search-entry"
        data-testid="search-input"
        role="button"
        tabIndex={0}
        onClick={() => navigate('#/search')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate('#/search');
        }}
      >
        <SearchIcon size={16} />
        搜索剧集
      </div>
      <h2 className="section-title">为你推荐</h2>
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
            <>
              <LoadMoreSentinel onVisible={loadMore} />
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
            </>
          )}
        </>
      )}
    </div>
  );
}
