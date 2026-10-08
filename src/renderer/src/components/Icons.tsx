import type { ReactElement, ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function svg(node: ReactNode, size = 16, viewBox = '0 0 24 24'): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {node}
    </svg>
  );
}

export function HomeIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </>,
        size,
      )}
    </span>
  );
}

export function GridIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>,
        size,
      )}
    </span>
  );
}

export function TrophyIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1" />
        </>,
        size,
      )}
    </span>
  );
}

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>,
        size,
      )}
    </span>
  );
}

export function BookmarkIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(<path d="M6 3h12v18l-6-4.5L6 21V3Z" />, size)}
    </span>
  );
}

export function PlayIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" stroke="none" />, size)}
    </span>
  );
}

export function PauseIcon({ size = 18, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
          <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
        </>,
        size,
      )}
    </span>
  );
}

export function PrevIcon({ size = 16, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M19 20 9 12l10-8v16Z" fill="currentColor" stroke="none" />
          <path d="M5 5v14" />
        </>,
        size,
      )}
    </span>
  );
}

export function NextIcon({ size = 16, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="m5 4 10 8-10 8V4Z" fill="currentColor" stroke="none" />
          <path d="M19 5v14" />
        </>,
        size,
      )}
    </span>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M6 6l12 12M18 6 6 18" />
        </>,
        size,
      )}
    </span>
  );
}

/** 横竖屏切换（双向回环箭头；PRD v1.2 player-rotate 按钮图标） */
export function RotateIcon({ size = 16, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M16.5 2.5 19 5l-2.5 2.5" />
          <path d="M19 5h-7a4 4 0 0 0-4 4v1" />
          <path d="M7.5 21.5 5 19l2.5-2.5" />
          <path d="M5 19h7a4 4 0 0 0 4-4v-1" />
        </>,
        size,
      )}
    </span>
  );
}

export function HeartIcon({ size = 16, className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <path
          d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.3 1-1.4 2.6-2.3 4.3-2.3 2.5 0 4.7 1.9 4.7 4.8 0 3.9-4 7.2-9 11.2Z"
          fill={filled ? 'currentColor' : 'none'}
        />,
        size,
      )}
    </span>
  );
}

export function WarnIcon({ size = 16, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 10v4M12 17.5v.5" />
        </>,
        size,
      )}
    </span>
  );
}

export function ErrorCircleIcon({ size = 48, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V13M12 16v.5" />
        </>,
        size,
      )}
    </span>
  );
}

export function EmptyBoxIcon({ size = 64, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <>
          <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
          <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
        </>,
        size,
      )}
    </span>
  );
}

export function FireIcon({ size = 13, className }: IconProps) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      {svg(
        <path
          d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5-3.5-6.5C14 7.5 13 5.5 13 3c-3 2-5 4.7-5 7.5 0 1.5.5 2.6 1 3.5-1.2-.3-2.2-1-2.7-2.2C5.3 13.2 5 14.3 5 15.5 5 19.3 8 22 12 22Z"
          fill="currentColor"
          stroke="none"
        />,
        size,
      )}
    </span>
  );
}

/** 全屏播放（四角外扩图标；dock 播放器全屏按钮） */
export function FullscreenIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
