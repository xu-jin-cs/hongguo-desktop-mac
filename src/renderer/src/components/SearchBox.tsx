import { useRef, useState } from 'react';
import { SearchIcon } from './Icons';

export const SEARCH_MAX_LEN = 50;
export const SEARCH_HINT = '请输入 1-50 字关键词';

/**
 * 搜索框（ui_spec §6.2：h44 / w560 居中 / radius-pill-22 / 提交按钮内嵌右侧 w64 h32）
 * 前端拦截（interaction §6）：q 为空或超 50 字 → 不发请求，红描边 + 300ms 抖动 + 提示。
 */
export function SearchBox({
  onSubmit,
  onLiveChange,
  submitting = false,
  autoFocus = false,
}: {
  onSubmit: (q: string) => void;
  onLiveChange?: (q: string) => void;
  submitting?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const invalid = trimmed.length === 0 || trimmed.length > SEARCH_MAX_LEN;

  const submit = () => {
    if (submitting) return;
    if (invalid) {
      setError(true);
      setShakeKey((k) => k + 1); // 重触发抖动动画
      return;
    }
    setError(false);
    onSubmit(trimmed);
  };

  return (
    <div className="search-box-wrap">
      <div
        key={shakeKey}
        className={[
          'search-box',
          focused ? 'is-focused' : '',
          error ? 'is-error' : '',
          shakeKey > 0 && error ? 'is-shaking' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SearchIcon size={16} className="search-icon" />
        <input
          ref={inputRef}
          data-testid="search-input"
          type="text"
          placeholder="搜索剧集"
          maxLength={80}
          value={value}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(false);
            onLiveChange?.(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button
          type="button"
          className="search-submit"
          data-testid="search-submit"
          disabled={submitting || trimmed.length === 0}
          onClick={submit}
        >
          {submitting ? <span className="spinner s14 on-accent" /> : '搜索'}
        </button>
      </div>
      {error && <div className="search-error-text">{SEARCH_HINT}</div>}
    </div>
  );
}
