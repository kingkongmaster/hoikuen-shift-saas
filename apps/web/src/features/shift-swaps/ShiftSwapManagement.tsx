import { useCallback, useEffect, useState } from 'react';
import { api, type Session, type ShiftSwap, type SwapTarget } from '../../api/client';
import { EmptyState, MessageBanner, SkeletonState } from '../../components/UiStates';

const statusLabels: Record<ShiftSwap['status'], string> = {
  PENDING: '申請中',
  APPROVED: '承認済み',
  REJECTED: '却下',
  CANCELLED: '取消',
};

export function ShiftSwapManagement({ session }: { session: Session }) {
  const manager = session.role === 'ADMIN' || session.role === 'DIRECTOR';
  const [rows, setRows] = useState<ShiftSwap[]>([]);
  const [targets, setTargets] = useState<SwapTarget[]>([]);
  const [input, setInput] = useState({ targetMemberId: '', requestDate: '', requestComment: '' });
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRows, nextTargets] = await Promise.all([api.shiftSwaps(session.accessToken), api.shiftSwapTargets(session.accessToken)]);
      setRows(nextRows);
      setTargets(nextTargets.filter((item) => item.userId));
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '交換申請を確認できませんでした。時間をおいてもう一度お試しください。' });
    } finally {
      setLoading(false);
    }
  }, [session.accessToken]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.createShiftSwap(session.accessToken, input);
      setInput({ targetMemberId: '', requestDate: '', requestComment: '' });
      setMessage({ kind: 'success', text: 'シフト交換を申請しました。相手の先生と園からの確認をお待ちください。' });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '交換申請を保存できませんでした。入力内容を確認して、もう一度お試しください。' });
    } finally {
      setSaving(false);
    }
  };
  const update = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const adminComment = window.prompt(status === 'APPROVED' ? '先生へのコメントがあれば入力してください（任意）' : '却下の理由や、先生への案内を入力してください（任意）') ?? undefined;
    setSaving(true);
    try {
      await api.updateShiftSwap(session.accessToken, id, { status, adminComment });
      setMessage({ kind: 'success', text: status === 'APPROVED' ? '交換申請を承認しました。' : '交換申請を却下しました。' });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '交換申請を更新できませんでした。時間をおいてもう一度お試しください。' });
    } finally {
      setSaving(false);
    }
  };
  const cancel = async (id: string) => {
    if (!window.confirm('この交換申請を取り消しますか？ 取り消した申請は履歴に残ります。')) return;
    setSaving(true);
    try {
      await api.cancelShiftSwap(session.accessToken, id);
      setMessage({ kind: 'success', text: '交換申請を取り消しました。' });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '交換申請を取り消せませんでした。時間をおいてもう一度お試しください。' });
    } finally {
      setSaving(false);
    }
  };

  return <section className="mt-6">
    <div className="card">
      <h3 className="text-xl font-bold">シフト交換</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">交換したい先生と日付を選んで申請します。確定済みの同じ日の勤務が対象です。</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">交換する先生<select value={input.targetMemberId} onChange={(event) => setInput({ ...input, targetMemberId: event.target.value })} className="input mt-2"><option value="">先生を選択してください</option>{targets.map((item) => <option key={item.userId} value={item.userId!}>{item.employeeNumber} {item.displayName}</option>)}</select></label>
        <label className="text-sm font-bold">交換する日<input type="date" min={localDateKey(new Date())} value={input.requestDate} onChange={(event) => setInput({ ...input, requestDate: event.target.value })} className="input mt-2" /></label>
        <label className="text-sm font-bold sm:col-span-2">相手の先生へのコメント（任意）<input placeholder="例：家庭の予定があるため、交換をお願いします" value={input.requestComment} onChange={(event) => setInput({ ...input, requestComment: event.target.value })} className="input mt-2" /></label>
      </div>
      <button type="button" disabled={saving || !input.targetMemberId || !input.requestDate} onClick={() => void create()} className="btn-primary mt-5 w-full sm:w-fit">{saving ? '申請しています…' : 'シフト交換を申請'}</button>
    </div>
    {message && <div className="mt-4"><MessageBanner kind={message.kind}>{message.text}</MessageBanner></div>}
    {loading ? <div className="mt-5"><SkeletonState cards={2} label="交換申請を読み込んでいます…" /></div>
      : rows.length ? <ul className="mt-5 grid gap-4 lg:grid-cols-2">{rows.map((row) => <li key={row.id} className="card">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[var(--brand)]">{formatDate(row.requestDate)}</p><strong className="mt-1 block text-lg">{row.requester.displayName}さん → {row.targetMember.displayName}さん</strong></div><span className="text-label">{statusLabels[row.status]}</span></div>
        {row.requestComment && <p className="mt-4 rounded-xl bg-[var(--canvas)] p-3 text-sm">申請コメント：{row.requestComment}</p>}
        {row.adminComment && <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">園から：{row.adminComment}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{row.status === 'PENDING' && row.requesterId === session.user.id && <button type="button" disabled={saving} onClick={() => void cancel(row.id)} className="btn-secondary text-[var(--coral)]">申請を取り消す</button>}{manager && row.status === 'PENDING' && <><button type="button" disabled={saving} onClick={() => void update(row.id, 'APPROVED')} className="btn-primary">承認する</button><button type="button" disabled={saving} onClick={() => void update(row.id, 'REJECTED')} className="btn-secondary">却下する</button></>}</div>
      </li>)}</ul>
        : <div className="mt-5"><EmptyState symbol="交" title="交換申請はまだありません" description="交換が必要なときは、上の入力欄から相手の先生と日付を選んで申請できます。" /></div>}
  </section>;
}

function localDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(value));
}
