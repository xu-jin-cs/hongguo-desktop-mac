import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSource } from '../api/dataSource';
import {
  CloseIcon,
  ErrorCircleIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RotateIcon,
  FullscreenIcon,
  HeartIcon,
  WarnIcon,
} from '../components/Icons';
import { toast } from '../components/Toast';
import { navigate } from '../router';
import { findNextSeason } from '../utils/season';
import { ApiError, type PlayInfo } from '../types';

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const RATE_KEY = 'hg_play_rate';
const CONTROLS_HIDE_MS = 3000;
const HISTORY_INTERVAL_MS = 5000;
/** 看完阈值（PRD §7：progress ≥ duration*0.95 视为看完，再进入自动定位下一集） */
const FINISH_RATIO = 0.95;

type Phase = 'loading' | 'ready' | 'error' | 'unplayable';

function loadRate(): number {
  try {
    const v = Number(window.localStorage.getItem(RATE_KEY));
    return (RATES as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 音轨 best-effort 检测（PRD v1.2「有声」硬验收；无跨浏览器统一 API，按可用性依次探测）：
 * 1. video.mozHasAudio —— Firefox 专有布尔属性，loadedmetadata 后即可靠；
 * 2. video.webkitAudioDecodedByteCount —— Chromium/WebKit 遗留解码字节计数器，>0 表示
 *    已解码出音频帧（需起播后采样，故由播放中事件驱动更新）；
 * 3. video.audioTracks —— 标准 AudioTrackList，length>0 即存在音轨（Safari 全量支持，
 *    Chromium 部分版本可用）。
 * 三者皆不可用 → 保守 false（检测手段缺失属环境事实，由冒烟证据如实记录）。
 */
function detectHasAudio(v: HTMLVideoElement): boolean {
  const probe = v as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };
  if (typeof probe.mozHasAudio === 'boolean') return probe.mozHasAudio;
  if (typeof probe.webkitAudioDecodedByteCount === 'number') {
    return probe.webkitAudioDecodedByteCount > 0;
  }
  if (probe.audioTracks && typeof probe.audioTracks.length === 'number') {
    return probe.audioTracks.length > 0;
  }
  return false;
}

/** 采样 video 运行态写入 window.__HG_PLAYER_STATE__（冒烟机械断言唯一事实源） */
function samplePlayerState(v: HTMLVideoElement): void {
  window.__HG_PLAYER_STATE__ = {
    hasAudio: detectHasAudio(v),
    hasVideo: v.videoWidth > 0 && v.videoHeight > 0,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    currentTime: v.currentTime,
    paused: v.paused,
  };
}

/**
 * Player（ui_spec §8：竖屏视口 405×720，控制条 h48，3s 无操作隐藏控制层）
 * 进度落库（interaction §4）：播放中每 5s + 暂停/退出/切集时 POST /api/history。
 * 播放失败：自动重试 1 次 → 错误态（PRD §7）。
 */
export function PlayerPage({ id, ep }: { id: string; ep: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const autoRetriedRef = useRef(false);
  const resumeAtRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('loading');
  const [play, setPlay] = useState<PlayInfo | null>(null);
  const [ended, setEnded] = useState(false);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [isFav, setIsFav] = useState(false);
  const [favActing, setFavActing] = useState(false);
  const seriesMetaFullRef = useRef<{ title: string; cover: string; total_episodes?: number; score?: number; hot?: number }>({ title: '', cover: '' });
  const [findingNextSeason, setFindingNextSeason] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(loadRate);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [manualFails, setManualFails] = useState(0);
  /** 横屏模式（PRD v1.2）：false=竖屏 405×720，true=横屏 16:9 占满内容区高度；仅切换容器类名，不动 video 元素，播放不中断 */
  // 横竖屏偏好本地持久化（修复：连播/切集路由跳转后横屏被重置回竖屏）
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // 全屏挂在 documentElement（永不随路由重建）——切集/连播时保持全屏（2026-10-07 用户反馈修复）
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);
  const [landscape, setLandscape] = useState(
    () => localStorage.getItem('hg-player-orientation') === 'landscape',
  );
  /** 当前剧集元数据（进度落库用 title/cover；真实模式 store 落库依赖调用方传入） */
  const seriesMetaRef = useRef<{ title: string; cover: string }>({ title: '', cover: '' });

  /* ---------- 1. 加载播放信息 + 进度记忆（95% 自动定位下一集） ---------- */
  useEffect(() => {
    let cancelled = false;
    autoRetriedRef.current = false;
    resumeAtRef.current = 0;
    setPhase('loading');
    setEnded(false);
    setCur(0);
    setDur(0);
    setBuf(0);
    setPlaying(false);
    // 拉取剧集元数据供进度落库（getSeries 有 10min 内存缓存，代价低；失败不阻断播放）
    seriesMetaRef.current = { title: '', cover: '' };
    void dataSource
      .getSeries(id)
      .then((d) => {
        seriesMetaRef.current = { title: d.title, cover: d.cover };
        seriesMetaFullRef.current = { title: d.title, cover: d.cover, total_episodes: d.total_episodes, score: d.score, hot: d.hot };
        setSeriesTitle(d.title);
      })
      .catch(() => {});
    // 收藏状态加载（播放页常驻收藏按钮）
    void dataSource
      .getFavorites()
      .then((res) => setIsFav(res.list.some((f) => f.series_id === id)))
      .catch(() => {});
    (async () => {
      try {
        const [p, hist] = await Promise.all([
          dataSource.getPlay(id, ep),
          dataSource.getHistory(),
        ]);
        if (cancelled) return;
        const entry = hist.list.find((h) => h.series_id === id);
        if (entry && entry.ep === ep && p.duration > 0) {
          if (entry.progress_sec >= p.duration * FINISH_RATIO) {
            if (p.next_ep) {
              navigate(`#/player/${encodeURIComponent(id)}/${p.next_ep}`);
              return;
            }
            resumeAtRef.current = 0;
          } else {
            resumeAtRef.current = Math.max(0, entry.progress_sec);
          }
        }
        if (!p.play_url) {
          setPlay(p);
          setPhase('unplayable');
          return;
        }
        setPlay(p);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 400) {
          toast('集数不存在', 'error');
          window.setTimeout(() => navigate(`#/detail/${encodeURIComponent(id)}`), 300);
          return;
        }
        if (err instanceof ApiError && err.code === 404) {
          // 官方网页源仅前 3 集；其后为 App 独占（上游 player 路由 404，三方实证）
          setPhase('unplayable');
          return;
        }
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, ep, reloadNonce]);

  /* ---------- 2. hls.js 挂载（失败自动重试 1 次 → 错误态） ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== 'ready' || !play?.play_url) return;
    video.playbackRate = rate;

    let hls: Hls | null = null;
    let disposed = false;

    const onFatal = () => {
      if (disposed) return;
      if (!autoRetriedRef.current) {
        autoRetriedRef.current = true;
        attach();
      } else if (play?.source === 'app_api_decrypted' && !forceRefreshedRef.current) {
        // App 端解密片源二次失败 → 删缓存强制重解一次再判死刑
        retryWithRefresh();
      } else {
        setPhase('error');
      }
    };

    const startPlayback = () => {
      if (resumeAtRef.current > 0 && video.duration > 2) {
        video.currentTime = Math.min(resumeAtRef.current, video.duration - 1);
      }
      video.play().catch(() => setPlaying(false));
    };

    function attach() {
      if (!video || !play) return;
      const isHls = /\.m3u8($|\?)/.test(play.play_url);
      if (isHls && Hls.isSupported()) {
        hls?.destroy();
        hls = new Hls({ maxBufferLength: 30 });
        hls.loadSource(play.play_url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) onFatal();
        });
        hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      } else if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        onFatal();
      } else {
        // 原生 HLS（Safari）或渐进式 MP4 直链：直接挂 src
        video.src = play.play_url;
        video.onloadedmetadata = startPlayback;
        video.onerror = onFatal;
      }
    }

    attach();
    return () => {
      disposed = true;
      hls?.destroy();
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    // rate 初读一次即可；切集由 App 以 key 重挂载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, play]);

  /* ---------- 3. 进度落库：每 5s + 暂停 + 退出/切集（effect 清理） ---------- */
  const postProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || phase !== 'ready') return;
    void dataSource
      .postHistory({
        series_id: id,
        ep,
        progress_sec: Math.floor(v.currentTime),
        title: seriesMetaRef.current.title,
        cover: seriesMetaRef.current.cover,
      })
      .catch(() => {});
  }, [id, ep, phase]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setInterval(postProgress, HISTORY_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      postProgress();
    };
  }, [phase, postProgress]);

  /* ---------- 3.5 播放运行态暴露（PRD v1.2）：loadedmetadata + 播放中事件采样写
   * window.__HG_PLAYER_STATE__，供冒烟断言「有声音轨 + 有画面帧 + 播放中」；
   * 卸载/离开 ready 态即删除，避免陈旧状态被误断言。 ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== 'ready') return;
    const sample = () => samplePlayerState(video);
    const EVENTS = ['loadedmetadata', 'playing', 'play', 'pause', 'timeupdate', 'ended'] as const;
    for (const ev of EVENTS) video.addEventListener(ev, sample);
    sample();
    return () => {
      for (const ev of EVENTS) video.removeEventListener(ev, sample);
      delete window.__HG_PLAYER_STATE__;
    };
  }, [phase, play]);

  /* ---------- 3.6 Esc 返回详情（横竖屏两态同效，与 player-close 等价） ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(`#/detail/${encodeURIComponent(id)}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  /* ---------- 4. 控制层 3s 自动隐藏（暂停/缓冲/异常态强制常显） ---------- */
  const forceVisible = !playing || buffering || phase !== 'ready' || ended;
  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !buffering && phase === 'ready' && !ended) {
        setControlsVisible(false);
      }
    }, CONTROLS_HIDE_MS);
  }, [buffering, ended, phase]);

  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [poke]);

  /* ---------- 5. 交互 ---------- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
    poke();
  }, [poke]);

  const cycleRate = useCallback(() => {
    setRate((prev) => {
      const idx = RATES.indexOf(prev as (typeof RATES)[number]);
      const next = RATES[(idx + 1) % RATES.length];
      const v = videoRef.current;
      if (v) v.playbackRate = next;
      try {
        window.localStorage.setItem(RATE_KEY, String(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });
    poke();
  }, [poke]);

  const goEp = useCallback(
    (target: number | null) => {
      if (!target) return;
      navigate(`#/player/${encodeURIComponent(id)}/${target}`);
    },
    [id],
  );

  /** 横竖屏切换：仅翻转容器类名，video 元素与 HLS 实例不动 → currentTime/播放状态/倍速全保持 */
  const toggleFav = useCallback(async () => {
    if (favActing) return;
    setFavActing(true);
    try {
      if (isFav) {
        await dataSource.removeFavorite(id);
        setIsFav(false);
        toast('已取消收藏', 'success');
      } else {
        await dataSource.addFavorite(id, seriesMetaFullRef.current);
        setIsFav(true);
        toast('已加入收藏', 'success');
      }
    } catch {
      toast('操作失败，请重试', 'error');
    } finally {
      setFavActing(false);
    }
  }, [favActing, isFav, id]);

  const toggleOrientation = useCallback(() => {
    setLandscape((v) => {
      const next = !v;
      localStorage.setItem('hg-player-orientation', next ? 'landscape' : 'portrait');
      return next;
    });
    poke();
  }, [poke]);

  const seekByPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = clamp01((e.clientX - rect.left) / rect.width);
      const v = videoRef.current;
      const total = v && Number.isFinite(v.duration) ? v.duration : dur;
      if (total > 0) {
        const t = ratio * total;
        if (v) v.currentTime = t;
        setDragTime(t);
        setCur(t);
      }
    },
    [dur],
  );

  const onEnded = useCallback(() => {
    postProgress();
    if (play?.next_ep) {
      goEp(play.next_ep);
      return;
    }
    // 本季末集：尝试自动跳下一季第1集（PRD v1.3）
    const curTitle = seriesMetaRef.current.title;
    if (curTitle) {
      setFindingNextSeason(true);
      setControlsVisible(true);
      dataSource
        .search(curTitle.replace(/第\s*[0-9一二三四五六七八九十两]+\s*季.*/, ''), 1, 20)
        .then((res) => {
          const next = findNextSeason(curTitle, res.list);
          if (next) {
            navigate(`#/player/${encodeURIComponent(next.series_id)}/1`);
          } else {
            setEnded(true);
          }
        })
        .catch(() => setEnded(true))
        .finally(() => setFindingNextSeason(false));
      return;
    }
    setEnded(true);
    setControlsVisible(true);
  }, [goEp, play?.next_ep, postProgress]);

  const manualRetry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  // App 端解密片源播放失败 → 强制重解重试一次（防坏缓存/抖动脉冲死，2026-10-07 D5 加固）
  const forceRefreshedRef = useRef(false);
  useEffect(() => { forceRefreshedRef.current = false; }, [id, ep]);
  const retryWithRefresh = useCallback(() => {
    setPlay((prev) => {
      if (!prev?.play_url || prev.source !== 'app_api_decrypted' || forceRefreshedRef.current) return prev;
      forceRefreshedRef.current = true;
      const sep = prev.play_url.includes('?') ? '&' : '?';
      return { ...prev, play_url: `${prev.play_url}${sep}refresh=1&t=${Date.now()}` };
    });
    setReloadNonce((n) => n + 1);
  }, []);

  /* ---------- 全屏状态跟踪 ---------- */
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* ---------- 渲染 ---------- */
  const displayCur = dragging && dragTime !== null ? dragTime : cur;
  const playedPct = dur > 0 ? clamp01(displayCur / dur) * 100 : 0;
  const bufPct = dur > 0 ? clamp01(buf / dur) * 100 : 0;
  const hideControls = !controlsVisible && !forceVisible;
  const showBar = phase === 'ready' && !ended;

  return (
    <div className="page-player">
      <div ref={stageRef} className={`player-stage${landscape ? ' is-landscape' : ''}`}>
      <div className="player-header">
        <div className="player-title" data-testid="player-title">
          {seriesTitle ? `${seriesTitle} · 第${ep}集` : `第${ep}集`}
        </div>
<button
            type="button"
            className={`player-fav-fixed header-btn${isFav ? ' is-fav' : ''}${favActing ? ' is-acting' : ''}`}
            data-testid="player-fav"
            aria-label={isFav ? '取消收藏' : '收藏'}
            disabled={favActing}
            onClick={() => void toggleFav()}
          >
            <HeartIcon size={16} filled={isFav} />
            <span>{isFav ? '已收藏' : '收藏'}</span>
          </button>
<button
            type="button"
            className={`player-rotate-fixed header-btn${landscape ? ' is-on' : ''}`}
            data-testid="player-rotate-fixed"
            aria-label={landscape ? '切换竖屏' : '切换横屏'}
            onClick={toggleOrientation}
          >
            <RotateIcon size={16} />
            <span>{landscape ? '竖屏' : '横屏'}</span>
          </button>
<button
            type="button"
            className="player-close"
            data-testid="player-close"
            aria-label="关闭"
            onClick={() => navigate(`#/detail/${encodeURIComponent(id)}`)}
          >
            <CloseIcon size={16} />
          </button>
      </div>
      <div
        className={`player-viewport${landscape ? ' is-landscape' : ''}${hideControls ? ' hide-cursor' : ''}`}
        onMouseMove={poke}
        onMouseDown={poke}
      >
        <video
          ref={videoRef}
          playsInline
          onClick={phase === 'ready' ? togglePlay : undefined}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDur(e.currentTarget.duration || 0)}
          onProgress={(e) => {
            const v = e.currentTarget;
            try {
              if (v.buffered.length > 0) setBuf(v.buffered.end(v.buffered.length - 1));
            } catch {
              /* 忽略 */
            }
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setBuffering(false);
            setPlaying(true);
            setManualFails(0);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            postProgress();
          }}
          onEnded={onEnded}
        />

        {/* BUFFERING（§8.6 中心缓冲圈 40×40，控制条保留可用） */}
        {buffering && phase === 'ready' && (
          <div className="player-overlay">
            <div className="buffer-ring" />
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="player-overlay solid">
            <div className="buffer-ring" />
          </div>
        )}

        {/* UNPLAYABLE（§6.6 空态：控制条仅 close 可用） */}
        {phase === 'unplayable' && (
          <div className="player-overlay solid">
            <div className="overlay-main" style={{ color: 'var(--text-secondary)' }}>
              该集为 App 独占内容
            </div>
            <div className="overlay-sub">官方网页源仅提供前 3 集，更多集数请在红果短剧 App 内观看</div>
            <button
              type="button"
              className="overlay-link"
              onClick={() => navigate(`#/detail/${encodeURIComponent(id)}`)}
            >
              返回详情
            </button>
          </div>
        )}

        {/* ERROR（§6.6 异常态 + §6.7 retry-btn；连续 3 次失败转静态文案） */}
        {phase === 'error' && (
          <div className="player-overlay solid">
            <ErrorCircleIcon size={32} className="overlay-icon" />
            <div className="overlay-main">片源异常，请稍后重试</div>
            {manualFails >= 3 ? (
              <div className="retry-static">
                <WarnIcon size={16} />
                稍后再试
              </div>
            ) : (
              <button
                type="button"
                className="retry-btn"
                data-testid="retry-btn"
                onClick={() => {
                  setManualFails((c) => c + 1);
                  manualRetry();
                }}
              >
                重试
              </button>
            )}
          </div>
        )}

        {/* 末集跳转下一季中（PRD v1.3） */}
        {findingNextSeason && !ended && (
          <div className="player-overlay solid">
            <div className="overlay-main">本季已看完，正在寻找下一季…</div>
          </div>
        )}

        {/* ENDED 末集（§8.6） */}
        {ended && (
          <div className="player-overlay solid">
            <div className="overlay-main success">已看完（已是最终季）</div>
            <button
              type="button"
              className="overlay-link"
              onClick={() => navigate(`#/detail/${encodeURIComponent(id)}`)}
            >
              返回详情
            </button>
          </div>
        )}
      </div>
      {showBar && (
        <div className="player-dock">
          <div className="player-bar">

              <button
                type="button"
                className="player-btn"
                data-testid="player-prev"
                aria-label="上一集"
                disabled={!play?.prev_ep}
                onClick={() => goEp(play?.prev_ep ?? null)}
              >
                <PrevIcon size={16} />
              </button>
              <button
                type="button"
                className="player-btn main"
                data-testid="player-core"
                aria-label={playing ? '暂停' : '播放'}
                onClick={togglePlay}
              >
                {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
              </button>
              <button
                type="button"
                className="player-btn"
                data-testid="player-next"
                aria-label="下一集"
                disabled={!play?.next_ep}
                onClick={() => goEp(play?.next_ep ?? null)}
              >
                <NextIcon size={16} />
              </button>
              <button
                type="button"
                className={`player-rate${rate !== 1 ? ' is-active' : ''}`}
                data-testid="player-rate"
                onClick={cycleRate}
              >
                {rate}x
              </button>
              <button
                type="button"
                className={`player-btn${isFullscreen ? ' is-on' : ''}`}
                data-testid="player-fullscreen"
                aria-label={isFullscreen ? '退出全屏' : '全屏播放'}
                onClick={toggleFullscreen}
              >
                <FullscreenIcon size={16} />
              </button>
              <span className="player-time">
                {fmtTime(displayCur)}
                <span className="total"> / {fmtTime(dur)}</span>
              </span>
              <div
                className={`player-progress${dragging ? ' is-dragging' : ''}`}
                data-testid="player-progress"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  seekByPointer(e);
                }}
                onPointerMove={(e) => {
                  if (dragging) seekByPointer(e);
                }}
                onPointerUp={() => {
                  setDragging(false);
                  setDragTime(null);
                  postProgress();
                }}
              >
                <div className="progress-track">
                  <div className="progress-buffered" style={{ width: `${bufPct}%` }} />
                  <div className="progress-played" style={{ width: `${playedPct}%` }} />
                  <div className="progress-knob" style={{ left: `${playedPct}%` }} />
                </div>
              </div>
            </div>
        </div>
      )}
      </div>
    </div>
  );
}
