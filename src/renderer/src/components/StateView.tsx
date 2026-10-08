import { errorText } from '../types';
import { EmptyBoxIcon, ErrorCircleIcon, WarnIcon } from './Icons';

/** 空态（ui_spec §7 EMPTY） */
export function EmptyView({ text = '暂无内容', cta }: { text?: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="state-view">
      <div className="state-icon-ring">
        <EmptyBoxIcon size={64} className="state-icon" />
      </div>
      <div className="state-text">{text}</div>
      {cta ? (
        <button type="button" className="state-cta" onClick={cta.onClick}>
          {cta.label}
        </button>
      ) : null}
    </div>
  );
}

/** 错误态（ui_spec §7 ERROR + §6.7 retry-btn；连续 3 次失败 → 「稍后再试」静态文案） */
export function ErrorView({
  code,
  onRetry,
  retrying = false,
  failCount = 0,
}: {
  code?: number;
  onRetry?: () => void;
  retrying?: boolean;
  failCount?: number;
}) {
  return (
    <div className="state-view">
      <ErrorCircleIcon size={48} className="state-icon error" />
      <div className="state-text">{errorText(code ?? 0)}</div>
      {onRetry ? (
        failCount >= 3 ? (
          <div className="retry-static">
            <WarnIcon size={16} />
            稍后再试
          </div>
        ) : (
          <button
            className="retry-btn"
            data-testid="retry-btn"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying && <span className="spinner s14 on-accent" />}
            {retrying ? '重试中' : '重试'}
          </button>
        )
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>请返回上一页</div>
      )}
    </div>
  );
}

/** 栅格骨架（ui_spec §7 LOADING：168×224 ×N，N=首屏容量 12） */
export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div
            className="skeleton"
            style={{ width: 168, height: 224, borderRadius: 'var(--radius-3)' }}
          />
          <div className="skeleton" style={{ width: 168, height: 14, marginTop: 8 }} />
          <div className="skeleton" style={{ width: 104, height: 14, marginTop: 6 }} />
          <div className="skeleton" style={{ width: 72, height: 12, marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

/** 列表行骨架（§7 LOADING：h72 ×6） */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="history-item" style={{ cursor: 'default' }}>
          <div className="skeleton" style={{ width: 40, height: 56, borderRadius: 'var(--radius-2)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ width: 240, height: 14 }} />
            <div className="skeleton" style={{ width: 160, height: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 离线态横幅（ui_spec §7 OFFLINE：h40 全宽，z-index 550） */
export function OfflineBanner() {
  return (
    <div className="offline-banner" role="alert">
      <WarnIcon size={16} />
      已离线，可查看本地收藏/历史
    </div>
  );
}
