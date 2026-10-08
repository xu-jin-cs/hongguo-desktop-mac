import { useState } from 'react';
import { dataSource } from '../api/dataSource';
import { SearchBox } from '../components/SearchBox';
import { SeriesCard } from '../components/SeriesCard';
import { EmptyView, ErrorView, SkeletonGrid } from '../components/StateView';
import { useCallback, useRef } from 'react';
import { usePagedList } from '../hooks';
import { navigate } from '../router';

const HISTORY_KEY = 'hg_search_history';
const HISTORY_MAX = 10;

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushHistory(q: string): string[] {
  const next = [q, ...readHistory().filter((x) => x !== q)].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return next;
}

/**
 * Search（interaction §3：搜索框 h44 w560 居中；历史搜索 chips h36；结果栅格同 Home）
 * 空/超 50 字前端拦截在 SearchBox 内完成（红描边+抖动，不发请求）。
 */
export function SearchPage() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>(() => readHistory());

  const { status, items, total, error, failCount, hasMore, loadingMore, loadMore, retry } =
    usePagedList(
      (page) =>
        query
          ? dataSource.search(query, page, 20)
          : Promise.resolve({ list: [], has_more: false }),
      [query],
    );

  const submit = (q: string) => {
    if (q === query) return;
    setHistory(pushHistory(q));
    setQuery(q);
  };

  // 输入防抖实时搜索（500ms；提升"搜不到"场景的可感知性，2026-10-07 用户反馈）
  const liveTimer = useRef<number | undefined>(undefined);
  const liveSearch = useCallback(
    (q: string) => {
      window.clearTimeout(liveTimer.current);
      const t = q.trim();
      if (!t || t.length > 50) return;
      liveTimer.current = window.setTimeout(() => {
        setHistory(pushHistory(t));
        setQuery(t);
      }, 500);
    },
    [],
  );

  return (
    <div className="page page-search">
      <SearchBox onSubmit={submit} submitting={query !== '' && status === 'loading'} autoFocus onLiveChange={liveSearch} />
      {history.length > 0 && !query && (
        <div className="chips-row">
          <span className="chips-label">历史搜索</span>
          {history.map((h) => (
            <button key={h} type="button" className="chip" onClick={() => submit(h)}>
              {h}
            </button>
          ))}
        </div>
      )}
      <div style={{ height: 'var(--space-5)' }} />
      {!query && history.length === 0 && <EmptyView text="输入关键词搜索剧集" />}
      {query && status === 'loading' && <SkeletonGrid />}
      {query && status === 'error' && (
        <ErrorView code={error?.code} failCount={failCount} onRetry={retry} retrying={false} />
      )}
      {query && status === 'empty' && <EmptyView text={`没有找到「${query}」相关内容`} />}
      {query && status === 'normal' && total > 0 && (
        <div className="search-total" data-testid="search-total">
          共找到约 {total} 部 · 官方网页源最多返回前 10 部，未找到可换关键词再试
        </div>
      )}
      {query && status === 'normal' && (
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
