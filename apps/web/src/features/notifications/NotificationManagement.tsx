import { useEffect, useState } from 'react';
import { api, type Notification, type Session } from '../../api/client';
import { EmptyState, LoadingState, MessageBanner } from '../../components/UiStates';

export function NotificationManagement({ session, onUnreadChange }: { session: Session; onUnreadChange: (count: number) => void }) {
  const [rows, setRows] = useState<Notification[]>([]);
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
      setMessage('お知らせを確認済みにしました。');
      setMessageError(false);
      await load();
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
  return <section className="mt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-xl font-bold">通知一覧</h3><p className="mt-1 text-sm text-slate-500">未読 {unread}件／全{rows.length}件</p></div>
      <button type="button" onClick={all} disabled={!unread || loading} className="btn-secondary">すべて既読</button>
    </div>
    {message && <div className="mt-4"><MessageBanner kind={messageError ? 'error' : 'success'}>{message}</MessageBanner></div>}
    {loading
      ? <div className="mt-4"><LoadingState label="通知を読み込んでいます…" /></div>
      : rows.length
        ? <ul className="mt-4 space-y-3">{rows.map((row) => <li key={row.id} className={`rounded-2xl border p-4 shadow-sm ${row.isRead ? 'border-slate-200 bg-white' : 'border-emerald-300 bg-emerald-50'}`}><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{row.title}</strong>{!row.isRead && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">未読</span>}</div><p className="mt-1 break-words text-sm">{row.message}</p><p className="mt-2 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString('ja-JP')}／{row.type}</p></div>{!row.isRead && <button type="button" onClick={() => void read(row.id)} className="btn-primary h-fit text-sm">既読にする</button>}</div></li>)}</ul>
        : <div className="mt-4"><EmptyState symbol="知" title="新しいお知らせはありません" description="シフトの確定や申請の更新があると、この画面でお知らせします。" /></div>}
  </section>;
}
