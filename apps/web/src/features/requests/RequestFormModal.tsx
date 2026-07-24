import { FormEvent, useState } from 'react';
import type { ShiftRequest, ShiftRequestInput, ShiftRequestStatus, ShiftRequestType, StaffOption } from '../../api/client';

export const requestTypeOptions: { value: ShiftRequestType; label: string }[] = [
  { value: 'DAY_OFF', label: '希望休' }, { value: 'PAID_LEAVE', label: '有給' }, { value: 'SUMMER_LEAVE', label: '夏季休暇' },
  { value: 'BEREAVEMENT', label: '慶弔' }, { value: 'HALF_DAY_AM', label: '半休午前' }, { value: 'HALF_DAY_PM', label: '半休午後' }, { value: 'OTHER', label: 'その他' },
];
const statusOptions: { value: ShiftRequestStatus; label: string }[] = [
  { value: 'PENDING', label: '申請中' }, { value: 'APPROVED', label: '承認' }, { value: 'REJECTED', label: '却下' }, { value: 'CANCELLED', label: '取消' },
];

export function RequestFormModal({ request, reviewer, staffOptions, saving, onClose, onSave }: {
  request?: ShiftRequest; reviewer: boolean; staffOptions: StaffOption[]; saving: boolean; onClose: () => void;
  onSave: (input: ShiftRequestInput & { status?: ShiftRequestStatus; adminComment?: string | null }) => Promise<void>;
}) {
  const [staffId, setStaffId] = useState(request?.staffId ?? staffOptions[0]?.id ?? '');
  const [requestDate, setRequestDate] = useState(request?.requestDate.slice(0, 10) ?? '');
  const [requestType, setRequestType] = useState<ShiftRequestType>(request?.requestType ?? 'DAY_OFF');
  const [reason, setReason] = useState(request?.reason ?? '');
  const [status, setStatus] = useState<ShiftRequestStatus>(request?.status ?? 'PENDING');
  const [adminComment, setAdminComment] = useState(request?.adminComment ?? '');
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({
      ...(reviewer && !request ? { staffId } : {}), requestDate, requestType, reason: reason.trim() || null,
      ...(reviewer && request ? { status, adminComment: adminComment.trim() || null } : {}),
    });
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="request-form-title">
    <form onSubmit={submit} className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl md:max-w-xl md:rounded-2xl md:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-700">希望休</p><h3 id="request-form-title" className="text-2xl font-bold">{request ? '申請を編集' : '希望休を申請'}</h3></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" aria-label="閉じる">✕</button></div>
      <p className="mt-2 text-sm text-slate-500"><span className="font-semibold text-rose-600">*</span> は必須項目です。</p>
      {reviewer && <label className="mt-6 block text-sm font-medium">職員 <span className="text-rose-600">*</span>{request ? <span className="input mt-2 block bg-slate-50">{request.staff.employeeNumber} {request.staff.displayName}</span> : <select required value={staffId} onChange={(e) => setStaffId(e.target.value)} className="input mt-2"><option value="">選択してください</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.employeeNumber} {staff.displayName}</option>)}</select>}</label>}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">希望日 <span className="text-rose-600">*</span><input required type="date" min={today} value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="input mt-2" /></label>
        <label className="block text-sm font-medium">種類 <span className="text-rose-600">*</span><select required value={requestType} onChange={(e) => setRequestType(e.target.value as ShiftRequestType)} className="input mt-2">{requestTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <label className="mt-5 block text-sm font-medium">職員コメント<textarea maxLength={1000} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-2 resize-y" placeholder="理由や連絡事項（任意）" /></label>
      {reviewer && request && <div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">状態<select value={status} onChange={(e) => setStatus(e.target.value as ShiftRequestStatus)} className="input mt-2">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block text-sm font-medium sm:col-span-2">管理者コメント<textarea maxLength={1000} rows={3} value={adminComment} onChange={(e) => setAdminComment(e.target.value)} className="input mt-2 resize-y" /></label></div>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-5 py-3 font-semibold">キャンセル</button><button disabled={saving || (reviewer && !request && !staffId)} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{saving ? '保存中…' : request ? '更新する' : '申請する'}</button></div>
    </form>
  </div>;
}
