import { useEffect, useState } from 'react';
import { api, type Notification, type NotificationType, type Session } from '../../api/client';
import { EmptyState, LoadingState, MessageBanner } from '../../components/UiStates';

type View = 'requests' | 'calendar' | 'shifts' | 'swaps';

const typeBadgeLabels: Record<NotificationType, { label: string }> = {
  SHIFT_CONFIRMED: { label: 'シフト確定' },
  SHIFT_UPDATED: { label: 'シフト変更' },
  REQUEST_APPROVED: { label: '希望休承認' },
  REQUEST_REJECTED: { label: '希望休却下' },
  SHIFT_SWAP_REQUEST: { label: 'シフト交換依頼' },
  SHIFT_SWAP_APPROVED: { label: 'シフト交換承認' },
  SHIFT_SWAP_REJECTED: { label: 'シフト交換却下' },
  SYSTEM: { label: 'お知らせ' },
};

function getTargetView(type: NotificationType, role: string): View | null {
  switch (type) {
    case 'REQUEST_APPROVED':
    case 'REQUEST_REJECTED':
      return 'requests';
    case 'SHIFT_CONFIRMED':
    case 'SHIFT_UPDATED':
      return role === 'STAFF' || role === 'CHIEF' ? 'calendar' : 'shifts';
    case 'SHIFT_SWAP_REQUEST':
    case 'SHIFT_SWAP_APPROVED':
    case 'SHIFT_SWAP_REJECTED':
      return 'swaps';
    default:
      return null;
  }
}

function getTargetViewLabel(target: View): string {
  switch (target) {
    case 'requests': return '希望休画面へ移動';
    case 'calendar': return '個人カレンダーを見る';
    case 'shifts': return '月間シフトを見る';
    case 'swaps': return 'シフト交換画面へ移動';
  }
}

export function NotificationManagement({
  session,
  onUnreadChange,
  onNavigate,
}: {
  session: Session;
  onUnreadChange: (count: number) => void;
  onNavigate?: (view: any) => void;
}) {
  const [rows, setRows] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [loading, setLoading] = useState(true);

  const unread = rows.filter((row) => !row.isRead).length;

  const load = async () => {
    setLoading(true);
    try {
      const next = await api.notifications(session.accessToken);
      setRows(next);
      onUnreadChange(next.filter((row) => !row.isRead).length);
      setMessageError(false);
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : '通知を確認できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const read = async (id: string) => {
    try {
      await api.readNotification(session.accessToken, id);
      setRows((prev) => {
        const updated = prev.map((row) => (row.id === id ? { ...row, isRead: true } : row));
        onUnreadChange(updated.filter((r) => !r.isRead).length);
        return updated;
      });
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : 'お知らせを確認済みにできませんでした。もう一度お試しください。');
    }
  };

  const all = async () => {
    try {
      await api.readAllNotifications(session.accessToken);
      setMessage('すべてのお知らせを確認済みにしました。');
      setMessageError(false);
      await load();
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : 'お知らせを更新できませんでした。もう一度お試しください。');
    }
  };

  const handleCardClick = async (row: Notification) => {
    if (!row.isRead) {
      await read(row.id);
    }
    const target = getTargetView(row.type, session.role);
    if (target && onNavigate) {
      onNavigate(target);
    }
  };

  // Sorting rule: 1. Unread first, 2. Newest date first
  const sortedRows = [...rows].sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const displayRows = filter === 'unread' ? sortedRows.filter((r) => !r.isRead) : sortedRows;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">通知一覧</h3>
          <p className="mt-1 text-sm text-slate-500">未読 {unread}件／全{rows.length}件</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${filter === 'all' ? 'bg-white font-bold shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              すべて ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${filter === 'unread' ? 'bg-white font-bold shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              未読 ({unread})
            </button>
          </div>
          <button type="button" onClick={all} disabled={!unread || loading} className="btn-secondary text-sm">
            すべて既読
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4">
          <MessageBanner kind={messageError ? 'error' : 'success'}>{message}</MessageBanner>
        </div>
      )}

      {loading ? (
        <div className="mt-4">
          <LoadingState label="通知を読み込んでいます…" />
        </div>
      ) : displayRows.length ? (
        <ul className="mt-4 space-y-3">
          {displayRows.map((row) => {
            const targetView = getTargetView(row.type, session.role);
            const badgeMeta = typeBadgeLabels[row.type] || { label: row.type };
            return (
              <li
                key={row.id}
                onClick={() => void handleCardClick(row)}
                className={`group relative cursor-pointer rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:border-emerald-400 hover:shadow-md ${
                  row.isRead ? 'border-slate-200 bg-white' : 'border-emerald-300 bg-emerald-50/70'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!row.isRead ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                          新着・未読
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          既読
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {badgeMeta.label}
                      </span>
                      <strong className="text-base text-slate-900">{row.title}</strong>
                    </div>

                    <p className="mt-2 break-words text-sm leading-relaxed text-slate-700">{row.message}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-xs text-slate-500">
                      <span>{new Date(row.createdAt).toLocaleString('ja-JP')}</span>
                      {targetView && (
                        <span className="font-semibold text-emerald-700 group-hover:underline">
                          {getTargetViewLabel(targetView)} →
                        </span>
                      )}
                    </div>
                  </div>

                  {!row.isRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void read(row.id);
                      }}
                      className="btn-primary h-fit text-xs self-start shrink-0"
                    >
                      既読にする
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState
            symbol="知"
            title="現在、新しい通知はありません"
            description="シフトの確定や申請の更新があると、この画面でお知らせします。"
          />
        </div>
      )}
    </section>
  );
}
