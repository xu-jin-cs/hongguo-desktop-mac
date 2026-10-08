import { useCallback, useEffect, useState } from 'react';
import { dataSource } from '../api/dataSource';
import { EpisodeGrid } from '../components/EpisodeGrid';
import { HeartIcon } from '../components/Icons';
import { formatHot } from '../components/SeriesCard';
import { EmptyView, ErrorView, SkeletonGrid } from '../components/StateView';
import { toast } from '../components/Toast';
import { useFetch } from '../hooks';
import { navigate } from '../router';

/**
 * Detail（interaction §3 / ui_spec §3）：
 * 左封面 240×320，右元数据列 w616（标题 28/热度/评分/简介 max4 行），选集区 y≥380。
 * fav-btn：POST/DELETE /api/favorites，按钮态即时切换，ACTING 中禁用防重。
 */
export function DetailPage({ id }: { id: string }) {
  const detail = useFetch(() => dataSource.getSeries(id), [id]);
  const favorites = useFetch(() => dataSource.getFavorites(), []);
  const history = useFetch(() => dataSource.getHistory(), []);
  const [acting, setActing] = useState(false);

  const isFav = Boolean(favorites.data?.list.some((f) => f.series_id === id));
  const watchedEp = history.data?.list.find((h) => h.series_id === id)?.ep;
  const [watchedEps, setWatchedEps] = useState<Set<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void dataSource.getWatched(id).then((res) => {
      if (!cancelled && res?.list) {
        setWatchedEps(new Set(res.list.map((w) => w.ep)));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  const toggleFav = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      if (isFav) {
        await dataSource.removeFavorite(id);
      } else {
        // 携带当前剧集元数据（真实模式 store 落库依赖 title/cover/total_episodes/score/hot）
        const d = detail.data;
        await dataSource.addFavorite(
          id,
          d
            ? { title: d.title, cover: d.cover, total_episodes: d.total_episodes, score: d.score, hot: d.hot }
            : {},
        );
      }
      favorites.retry();
      toast(isFav ? '已取消收藏' : '已加入收藏', 'success');
    } catch {
      toast('操作失败，请重试', 'error');
    } finally {
      setActing(false);
    }
  }, [acting, detail.data, favorites, id, isFav]);

  const d = detail.data;

  return (
    <div className="page page-detail">
      {detail.status === 'loading' && (
        <>
          <div className="detail-top">
            <div className="skeleton" style={{ width: 240, height: 320, borderRadius: 'var(--radius-4)' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ width: 320, height: 28 }} />
              <div className="skeleton" style={{ width: 200, height: 14 }} />
              <div className="skeleton" style={{ width: '100%', height: 84 }} />
            </div>
          </div>
          <div className="ep-section">
            <SkeletonGrid count={6} />
          </div>
        </>
      )}
      {detail.status === 'error' && (
        <ErrorView
          code={detail.error?.code}
          failCount={detail.failCount}
          onRetry={detail.retry}
        />
      )}
      {detail.status === 'empty' && <EmptyView text="剧集不存在" />}
      {detail.status === 'normal' && d && (
        <>
          <button
            type="button"
            className="detail-back"
            data-testid="detail-back"
            aria-label="返回"
            onClick={() => window.history.back()}
          >
            ← 返回
          </button>
          <div className="detail-top">
            {d.cover ? (
              <div className="detail-backdrop" aria-hidden="true">
                <img src={d.cover} alt="" />
              </div>
            ) : null}
            <div className="detail-cover">
              {d.cover ? <img src={d.cover} alt={d.title} /> : null}
            </div>
            <div className="detail-meta">
              <div className="detail-title">{d.title}</div>
              <div className="detail-stats">
                <span className="hot">热度 {formatHot(d.hot)}</span>
                <span className="score">评分 {d.score.toFixed(1)}</span>
                <span>全{d.total_episodes}集</span>
              </div>
              <div className="detail-desc">{d.desc}</div>
              <div className="detail-actions">
                <button
                  type="button"
                  className={`fav-btn${isFav ? ' is-active' : ''}${acting ? ' is-acting' : ''}`}
                  data-testid="fav-btn"
                  disabled={acting}
                  onClick={() => void toggleFav()}
                >
                  {acting ? (
                    <span className={`spinner s14${isFav ? ' on-accent' : ''}`} />
                  ) : (
                    <HeartIcon size={16} filled={isFav} />
                  )}
                  {acting ? '处理中' : isFav ? '已收藏' : '收藏'}
                </button>
              </div>
            </div>
          </div>
          <div className="ep-section">
            <h2 className="section-title">选集</h2>
            <EpisodeGrid
              episodes={d.episodes}
              watchedEps={watchedEps}
              watchedEp={watchedEp}
              onSelect={(ep) => navigate(`#/player/${encodeURIComponent(id)}/${ep}`)}
            />
          </div>
        </>
      )}
    </div>
  );
}
