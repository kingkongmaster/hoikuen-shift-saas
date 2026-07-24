import type { ReactNode } from 'react';

export function LoadingState({ label = '読み込んでいます…' }: { label?: string }) {
  return <div role="status" className="ui-state"><span className="size-8 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-700" /><p className="font-semibold text-slate-700">{label}</p></div>;
}
export function SkeletonState({ cards = 3, label = '読み込んでいます…' }: { cards?: number; label?: string }) {
  return <div role="status" aria-label={label} className="skeleton-grid">
    {Array.from({ length: cards }, (_, index) => <div key={index} className="skeleton-card" aria-hidden="true"><span className="skeleton-line w-20" /><span className="skeleton-line mt-4 h-7 w-28" /><span className="skeleton-line mt-3 w-full" /></div>)}
    <span className="sr-only">{label}</span>
  </div>;
}
export function EmptyState({ title, description, action, symbol = '空' }: { title: string; description?: string; action?: ReactNode; symbol?: string }) {
  return <div className="ui-state"><span aria-hidden="true" className="empty-symbol">{symbol}</span><div><p className="font-bold text-slate-800">{title}</p>{description && <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}</div>{action}</div>;
}
export function MessageBanner({ kind, children }: { kind: 'success' | 'error' | 'info' | 'warning'; children: ReactNode }) {
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`message-banner message-${kind}`}>{children}</div>;
}
export function ErrorState({ title = '情報を表示できませんでした', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div className="ui-state border-rose-200"><span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-rose-50 text-xl font-black text-rose-700">!</span><div><p className="font-bold text-slate-800">{title}</p><p role="alert" className="mt-2 text-sm leading-6 text-rose-700">{message}</p></div>{onRetry && <button type="button" onClick={onRetry} className="btn-secondary">もう一度試す</button>}</div>;
}
