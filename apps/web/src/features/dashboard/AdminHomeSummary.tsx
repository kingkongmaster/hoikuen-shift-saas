import { useEffect, useState } from 'react';
import { api, type Notification, type Session } from '../../api/client';
import { SkeletonState } from '../../components/UiStates';

type Summary = {
  todayPending: number;
  pendingRequests: number;
  notificationCount: number;
  pendingSwaps: number;
  unreadNotices: number;
};

export function AdminHomeSummary({ session, notifications, onOpen }: { session: Session; notifications: Notification[]; onOpen: (view: 'requests' | 'notifications' | 'swaps') => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const month = localDateKey(new Date()).slice(0, 7);
    Promise.all([api.requests(session.accessToken, month), api.shiftSwaps(session.accessToken)])
      .then(([requests, swaps]) => {
        if (!active) return;
        const today = localDateKey(new Date());
        const pendingRequests = requests.filter((item) => item.status === 'PENDING');
        const pendingSwaps = swaps.filter((item) => item.status === 'PENDING');
        setSummary({
          todayPending: pendingRequests.filter((item) => localDateKey(new Date(item.createdAt)) === today).length + pendingSwaps.filter((item) => localDateKey(new Date(item.createdAt)) === today).length,
          pendingRequests: pendingRequests.length,
          notificationCount: notifications.length,
          pendingSwaps: pendingSwaps.length,
          unreadNotices: notifications.filter((item) => !item.isRead).length,
        });
        setError(false);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [notifications, session.accessToken]);

  return <section aria-labelledby="admin-summary-title">
    <div className="mb-4">
      <p className="eyebrow">FOR MANAGERS</p>
      <h2 id="admin-summary-title" className="mt-1 text-xl font-black">今日の確認</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">対応が必要なものを、ここから確認できます。</p>
    </div>
    {!summary && !error ? <SkeletonState cards={5} label="承認状況を確認しています…" />
      : error ? <p role="status" className="message-banner message-warning">承認状況を確認できませんでした。各メニューから内容をご確認ください。</p>
        : summary && <div className="summary-grid">
          <SummaryCard symbol="今" label="今日の承認待ち" value={summary.todayPending} featured onClick={() => onOpen('requests')} />
          <SummaryCard symbol="休" label="希望休件数" value={summary.pendingRequests} onClick={() => onOpen('requests')} />
          <SummaryCard symbol="知" label="通知件数" value={summary.notificationCount} onClick={() => onOpen('notifications')} />
          <SummaryCard symbol="交" label="交換申請件数" value={summary.pendingSwaps} onClick={() => onOpen('swaps')} />
          <SummaryCard symbol="未" label="未確認のお知らせ" value={summary.unreadNotices} onClick={() => onOpen('notifications')} />
        </div>}
  </section>;
}

function SummaryCard({ symbol, label, value, featured, onClick }: { symbol: string; label: string; value: number; featured?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={featured ? 'summary-card is-featured' : 'summary-card'} aria-label={`${label} ${value}件を確認`}>
    <span className="action-symbol action-symbol-soft" aria-hidden="true">{symbol}</span>
    <span className="min-w-0 text-left"><span className="block text-sm font-bold text-[var(--ink-muted)]">{label}</span><strong className="mt-1 block text-2xl font-black text-[var(--brand-deep)]">{value}<small className="ml-1 text-sm">件</small></strong></span>
  </button>;
}

function localDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
