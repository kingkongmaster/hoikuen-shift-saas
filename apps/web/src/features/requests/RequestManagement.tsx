import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Session, type ShiftRequest, type ShiftRequestInput, type ShiftRequestStatus, type StaffOption } from '../../api/client';
import { EmptyState, SkeletonState } from '../../components/UiStates';
import { RequestFormModal, requestTypeOptions } from './RequestFormModal';

const typeLabels = Object.fromEntries(requestTypeOptions.map((option) => [option.value, option.label])) as Record<ShiftRequest['requestType'], string>;
const statusLabels: Record<ShiftRequestStatus, string> = { PENDING: '申請中', APPROVED: '承認', REJECTED: '却下', CANCELLED: '取消' };
const statusClasses: Record<ShiftRequestStatus, string> = { PENDING: 'bg-amber-100 text-amber-900 border-amber-200', APPROVED: 'bg-emerald-100 text-emerald-900 border-emerald-200', REJECTED: 'bg-rose-100 text-rose-900 border-rose-200', CANCELLED: 'bg-slate-200 text-slate-600 border-slate-300' };

function currentMonth() { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7); }
function shiftMonth(month: string, amount: number) { const [year, value] = month.split('-').map(Number); return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7); }

export function RequestManagement({ session }: { session: Session }) {
  const reviewer = session.role === 'ADMIN' || session.role === 'DIRECTOR';
  const [month, setMonth] = useState(currentMonth); const [staffId, setStaffId] = useState('');
  const [requests, setRequests] = useState<ShiftRequest[]>([]); const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ShiftRequest | null | undefined>(undefined); const [cancelling, setCancelling] = useState<ShiftRequest | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, options] = await Promise.all([api.requests(session.accessToken, month, staffId || undefined), reviewer ? api.requestStaffOptions(session.accessToken) : Promise.resolve([])]);
      setRequests(items); setStaffOptions(options);
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '希望休を確認できませんでした。時間をおいてもう一度お試しください。' }); }
    finally { setLoading(false); }
  }, [month, reviewer, session.accessToken, staffId]);
  useEffect(() => { void load(); }, [load]);

  async function save(input: ShiftRequestInput & { status?: ShiftRequestStatus; adminComment?: string | null }) {
    setSaving(true); setMessage(null);
    try {
      if (editing) await api.updateRequest(session.accessToken, editing.id, input);
      else await api.createRequest(session.accessToken, input);
      setEditing(undefined); setMessage({ kind: 'success', text: editing ? '希望休を更新しました。' : '希望休を申請しました。' }); await load();
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '希望休を保存できませんでした。入力内容を確認して、もう一度お試しください。' }); }
    finally { setSaving(false); }
  }

  async function changeStatus(request: ShiftRequest, status: 'APPROVED' | 'REJECTED') {
    setSaving(true); setMessage(null);
    try { await api.updateRequest(session.accessToken, request.id, { status }); setMessage({ kind: 'success', text: status === 'APPROVED' ? '希望休を承認しました。' : '希望休を却下しました。' }); await load(); }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '希望休の状態を変更できませんでした。時間をおいてもう一度お試しください。' }); }
    finally { setSaving(false); }
  }

  async function cancel() {
    if (!cancelling) return; setSaving(true); setMessage(null);
    try { await api.cancelRequest(session.accessToken, cancelling.id); setCancelling(null); setMessage({ kind: 'success', text: '希望休を取り消しました。' }); await load(); }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '希望休を取り消せませんでした。時間をおいてもう一度お試しください。' }); }
    finally { setSaving(false); }
  }

  return <section className="mt-8">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xl font-bold">希望休</h3><p className="mt-1 text-sm text-slate-600">{reviewer ? '園全体の申請を確認し、承認・却下できます。' : '自分の希望休を申請・変更できます。'}</p></div><button onClick={() => setEditing(null)} className="btn-primary"><span className="action-symbol bg-white/15" aria-hidden="true">休</span>希望休を申請</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label className="text-sm font-medium" htmlFor="request-month">表示月</label><div className="mt-2 flex gap-2"><button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} className="min-h-11 rounded-lg border px-3 font-semibold" aria-label="前の月">‹</button><input id="request-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" /><button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} className="min-h-11 rounded-lg border px-3 font-semibold" aria-label="次の月">›</button></div></div>{reviewer && <label className="text-sm font-medium">職員で絞込み<select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="input mt-2"><option value="">全職員</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.employeeNumber} {staff.displayName}</option>)}</select></label>}</div>
      <div className="mt-5 flex flex-wrap gap-2">{(['PENDING','APPROVED','REJECTED','CANCELLED'] as ShiftRequestStatus[]).map((status) => <span key={status} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>{statusLabels[status]}</span>)}</div>
      {message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p>}
    </div>
    {loading ? <div className="mt-4"><SkeletonState cards={2} label="希望休を読み込んでいます…" /></div> : <><RequestCalendar month={month} requests={requests} /><div className="mt-5 grid gap-4 lg:grid-cols-2">{requests.length === 0 ? <div className="lg:col-span-2"><EmptyState symbol="休" title="希望休はまだありません" description="「希望休を申請」から、休みたい日を登録できます。" action={<button type="button" onClick={() => setEditing(null)} className="btn-primary">希望休を申請</button>} /></div> : requests.map((request) => <RequestCard key={request.id} request={request} reviewer={reviewer} saving={saving} onEdit={() => setEditing(request)} onCancel={() => setCancelling(request)} onStatus={(status) => void changeStatus(request, status)} />)}</div></>}
    {editing !== undefined && <RequestFormModal request={editing ?? undefined} reviewer={reviewer} staffOptions={staffOptions} saving={saving} onClose={() => setEditing(undefined)} onSave={save} />}
    {cancelling && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="alertdialog" aria-modal="true" aria-labelledby="cancel-request-title"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h3 id="cancel-request-title" className="text-xl font-bold">この希望休を取り消しますか？</h3><p className="mt-3 leading-7 text-slate-600">取り消した申請は履歴に残り、状態が「取消」に変わります。</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setCancelling(null)} className="btn-secondary">申請を残す</button><button disabled={saving} onClick={() => void cancel()} className="btn-danger">希望休を取り消す</button></div></div></div>}
  </section>;
}

function RequestCalendar({ month, requests }: { month: string; requests: ShiftRequest[] }) {
  const [year, value] = month.split('-').map(Number); const days = new Date(Date.UTC(year, value, 0)).getUTCDate(); const offset = new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
  const byDay = useMemo(() => { const map = new Map<number, ShiftRequest[]>(); for (const request of requests) { const day = Number(request.requestDate.slice(8, 10)); map.set(day, [...(map.get(day) ?? []), request]); } return map; }, [requests]);
  return <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid grid-cols-7 bg-slate-100 text-center text-xs font-semibold text-slate-600">{['日','月','火','水','木','金','土'].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7">{Array.from({ length: offset }).map((_, index) => <div key={`blank-${index}`} className="min-h-20 border-r border-t bg-slate-50 sm:min-h-28" />)}{Array.from({ length: days }, (_, index) => index + 1).map((day) => <div key={day} className="min-h-20 border-r border-t p-1 sm:min-h-28 sm:p-2"><p className="text-xs font-semibold text-slate-600">{day}</p><div className="mt-1 space-y-1">{(byDay.get(day) ?? []).map((request) => <div key={request.id} title={`${request.staff.displayName} ${typeLabels[request.requestType]}`} className={`truncate rounded border px-1 py-0.5 text-[10px] font-semibold sm:px-1.5 sm:text-xs ${statusClasses[request.status]}`}>{request.staff.displayName} {typeLabels[request.requestType]}</div>)}</div></div>)}</div></div>;
}

function RequestCard({ request, reviewer, saving, onEdit, onCancel, onStatus }: { request: ShiftRequest; reviewer: boolean; saving: boolean; onEdit: () => void; onCancel: () => void; onStatus: (status: 'APPROVED' | 'REJECTED') => void }) {
  const editable = reviewer || request.status === 'PENDING';
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{request.requestDate.slice(0, 10)} ・ {request.staff.employeeNumber}</p><h4 className="mt-1 text-lg font-bold">{request.staff.displayName}</h4><p className="mt-1 font-semibold text-emerald-800">{typeLabels[request.requestType]}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[request.status]}`}>{statusLabels[request.status]}</span></div>{request.reason && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">職員: {request.reason}</p>}{request.adminComment && <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">管理者: {request.adminComment}</p>}<div className="mt-4 flex flex-wrap gap-2">{reviewer && request.status === 'PENDING' && <><button disabled={saving} onClick={() => onStatus('APPROVED')} className="min-h-10 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">承認</button><button disabled={saving} onClick={() => onStatus('REJECTED')} className="min-h-10 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white">却下</button></>}{editable && <button onClick={onEdit} className="min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold">編集</button>}{request.status !== 'CANCELLED' && <button onClick={onCancel} className="min-h-10 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">取消</button>}</div></article>;
}
