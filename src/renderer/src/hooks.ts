import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type ListData } from './types';

/** 页面级状态机（interaction §5） */
export type PageStatus = 'loading' | 'normal' | 'empty' | 'error';

export interface FetchState<T> {
  status: PageStatus;
  data: T | null;
  error: ApiError | null;
  /** 连续失败次数（≥3 → retry-btn 转「稍后再试」静态文案） */
  failCount: number;
  retry: () => void;
}

/** 一次性数据拉取（Detail / Rank / Library 等） */
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null }>({
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const failCount = useRef(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((data) => {
        if (cancelled) return;
        failCount.current = 0;
        setState({ data, error: null });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        failCount.current += 1;
        setState((s) => ({
          data: s.data,
          error: err instanceof ApiError ? err : new ApiError(502, String(err)),
        }));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const status: PageStatus = loading
    ? 'loading'
    : state.error
      ? state.error.code === 404
        ? 'empty'
        : 'error'
      : 'normal';

  return { status, data: state.data, error: state.error, failCount: failCount.current, retry };
}

export interface PagedState<T> {
  status: PageStatus;
  items: T[];
  error: ApiError | null;
  failCount: number;
  hasMore: boolean;
  total: number;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/** 分页列表（Home / Category / Search 结果栅格） */
export function usePagedList<T>(
  fetcher: (page: number) => Promise<ListData<T>>,
  deps: unknown[],
): PagedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const failCount = useRef(0);
  const seq = useRef(0);

  const loadFirst = useCallback(() => {
    const mySeq = ++seq.current;
    setStatus('loading');
    setError(null);
    setItems([]);
    setPage(1);
    fetcher(1)
      .then((data) => {
        if (mySeq !== seq.current) return;
        failCount.current = 0;
        setItems(data.list);
        setHasMore(Boolean(data.has_more));
        setTotal(data.total ?? 0);
        setStatus(data.list.length === 0 ? 'empty' : 'normal');
      })
      .catch((err) => {
        if (mySeq !== seq.current) return;
        failCount.current += 1;
        setError(err instanceof ApiError ? err : new ApiError(502, String(err)));
        setStatus(err instanceof ApiError && err.code === 404 ? 'empty' : 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status !== 'normal') return;
    const mySeq = seq.current;
    const next = page + 1;
    setLoadingMore(true);
    fetcher(next)
      .then((data) => {
        if (mySeq !== seq.current) return;
        setItems((prev) => [...prev, ...data.list]);
        setHasMore(Boolean(data.has_more));
        setPage(next);
      })
      .catch(() => {
        /* 翻页失败保留已加载内容，用户可再次触发 */
      })
      .finally(() => {
        if (mySeq === seq.current) setLoadingMore(false);
      });
  }, [fetcher, hasMore, loadingMore, page, status]);

  return {
    status,
    items,
    total,
    error,
    failCount: failCount.current,
    hasMore,
    loadingMore,
    loadMore,
    retry: loadFirst,
  };
}

/** 离线监测（interaction §5 OFFLINE） */
export function useOffline(): boolean {
  const [offline, setOffline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return offline;
}
