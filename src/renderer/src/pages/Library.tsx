import { useState } from 'react';
import { dataSource } from '../api/dataSource';
import { HeartIcon } from '../components/Icons';
import { HistoryRow } from '../components/HistoryRow';
import { SeriesCard } from '../components/SeriesCard';
import { EmptyView, ErrorView, SkeletonGrid, SkeletonRows } from '../components/StateView';
import { toast } from '../components/Toast';
import { useFetch } from '../hooks';
import { navigate } from '../router';

type Tab = 'fav' | 'history';

/** Library（interaction §3：顶部 tab 收藏/历史 h44；历史行显示「看到第N集 · xx%」；一键续播） */
export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('fav');
  const favorites = useFetch(() => dataSource.getFavorites(), [tab]);
  const history = useFetch(() => dataSource.getHistory(), [tab]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const removeFav = async (seriesId: string) => {
    if (removingId) return;
    setRemovingId(seriesId);
    try {
      await dataSource.removeFavorite(seriesId);
      favorites.retry();
      toast('已取消收藏', 'success');
    } catch {
      toast('操作失败，请重试', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="page page-library">
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-item${tab === 'fav' ? ' is-active' : ''}`}
          onClick={() => setTab('fav')}
        >
          收藏
        </button>
        <button
          type="button"
          className={`tab-item${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          历史
        </button>
      </div>
      <div style={{ height: 'var(--space-5)' }} />

      {tab === 'fav' && (
        <>
          {favorites.status === 'loading' && <SkeletonGrid />}
          {favorites.status === 'error' && (
            <ErrorView
              code={favorites.error?.code}
              failCount={favorites.failCount}
              onRetry={favorites.retry}
            />
          )}
          {favorites.status !== 'loading' &&
            favorites.status !== 'error' &&
            (favorites.data?.list.length ? (
              <div className="card-grid">
                {favorites.data.list.map((s) => (
                  <div key={s.series_id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SeriesCard
                      item={s}
                      onOpen={(id) =>
                        navigate(`#/player/${encodeURIComponent(id)}/${s.episode ?? 1}`)
                      }
                    />
                    <button
                      type="button"
                      className="fav-btn is-active"
                      data-testid="fav-btn"
                      disabled={removingId === s.series_id}
                      onClick={() => void removeFav(s.series_id)}
                    >
                      {removingId === s.series_id ? (
                        <span className="spinner s14 on-accent" />
                      ) : (
                        <HeartIcon size={16} filled />
                      )}
                      {removingId === s.series_id ? '处理中' : '已收藏'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyView text="暂无收藏" cta={{ label: '去看看', onClick: () => { location.hash = '#/home'; } }} />
            ))}
        </>
      )}

      {tab === 'history' && (
        <>
          {history.status === 'loading' && <SkeletonRows />}
          {history.status === 'error' && (
            <ErrorView
              code={history.error?.code}
              failCount={history.failCount}
              onRetry={history.retry}
            />
          )}
          {history.status !== 'loading' &&
            history.status !== 'error' &&
            (history.data?.list.length ? (
              <div className="history-list">
                {history.data.list.map((h) => (
                  <HistoryRow
                    key={h.series_id}
                    item={h}
                    onResume={(seriesId, ep) =>
                      navigate(`#/player/${encodeURIComponent(seriesId)}/${ep}`)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="state-view" style={{ minHeight: 320 }}>
                <EmptyView text="暂无观看历史" cta={{ label: '去看看', onClick: () => { location.hash = '#/home'; } }} />
                <button
                  type="button"
                  className="state-link"
                  style={{ color: 'var(--state-info)', fontSize: 13 }}
                  onClick={() => navigate('#/home')}
                >
                  去看看
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
