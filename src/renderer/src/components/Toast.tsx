import { useEffect, useState } from 'react';
import { ErrorCircleIcon, WarnIcon } from './Icons';

export type ToastKind = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

let toastSeq = 0;

/** 全局轻提示（ui_spec §6.4 Toast：h40 / radius-4 / bg-L2 / 2000ms 自动消失） */
export function toast(msg: string, kind: ToastKind = 'error'): void {
  window.dispatchEvent(new CustomEvent('hg-toast', { detail: { msg, kind } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ msg: string; kind: ToastKind }>).detail;
      const id = ++toastSeq;
      setItems((prev) => [...prev.slice(-2), { id, msg: detail.msg, kind: detail.kind }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 2000);
    };
    window.addEventListener('hg-toast', onToast);
    return () => window.removeEventListener('hg-toast', onToast);
  }, []);
  return (
    <div className="toast-host">
      {items.map((t) => (
        <div className="toast" key={t.id} role="status">
          <span className={`toast-icon ${t.kind}`}>
            {t.kind === 'error' ? <ErrorCircleIcon size={16} /> : <WarnIcon size={16} />}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
