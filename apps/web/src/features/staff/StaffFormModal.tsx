import { FormEvent, useState } from 'react';
import type { AssignedClass, EmploymentType, Staff, StaffInput } from '../../api/client';

type FormState = {
  employeeNumber: string; displayName: string; email: string; employmentType: EmploymentType; assignedClass: AssignedClass;
  canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean;
  canWorkSaturdays: boolean; monthlyWorkHourLimit: string; weeklyAvailableDays: string; notes: string;
};

const employmentOptions: { value: EmploymentType; label: string }[] = [
  { value: 'FULL_TIME', label: '正規職員' }, { value: 'PART_TIME', label: 'パート' }, { value: 'REEMPLOYED', label: '再雇用' },
];
const classOptions: { value: AssignedClass; label: string }[] = [
  { value: 'AGE_0', label: '0歳児' }, { value: 'AGE_1', label: '1歳児' }, { value: 'AGE_2', label: '2歳児' },
  { value: 'AGE_3', label: '3歳児' }, { value: 'AGE_4', label: '4歳児' }, { value: 'AGE_5', label: '5歳児' },
  { value: 'FREE', label: 'フリー' }, { value: 'SUPPORT', label: '補助' },
];

function initialState(staff?: Staff): FormState {
  return {
    employeeNumber: staff?.employeeNumber ?? '', displayName: staff?.displayName ?? '', email: staff?.email ?? '',
    employmentType: staff?.employmentType ?? 'FULL_TIME', assignedClass: staff?.assignedClass ?? 'FREE',
    canWorkEarly: staff?.canWorkEarly ?? true, canWorkRegular: staff?.canWorkRegular ?? true, canWorkLate: staff?.canWorkLate ?? true,
    earlyShiftOnly: staff?.earlyShiftOnly ?? false, lateShiftOnly: staff?.lateShiftOnly ?? false,
    canWorkSaturdays: staff?.canWorkSaturdays ?? true,
    monthlyWorkHourLimit: staff?.monthlyWorkHourLimit?.toString() ?? '', weeklyAvailableDays: staff?.weeklyAvailableDays?.toString() ?? '',
    notes: staff?.notes ?? '',
  };
}

export function StaffFormModal({ staff, saving, onClose, onSave }: { staff?: Staff; saving: boolean; onClose: () => void; onSave: (input: StaffInput) => Promise<void> }) {
  const [form, setForm] = useState<FormState>(() => initialState(staff));
  const [localError, setLocalError] = useState('');
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setLocalError('');
    if (!form.canWorkEarly && !form.canWorkRegular && !form.canWorkLate) { setLocalError('勤務区分を1つ以上選択してください。'); return; }
    if (form.earlyShiftOnly && form.lateShiftOnly) { setLocalError('早出専任と遅出専任は同時に選択できません。'); return; }
    const input: StaffInput = {
      employeeNumber: form.employeeNumber.trim(), displayName: form.displayName.trim(), employmentType: form.employmentType,
      assignedClass: form.assignedClass, canWorkEarly: form.canWorkEarly, canWorkRegular: form.canWorkRegular,
      canWorkLate: form.canWorkLate, earlyShiftOnly: form.earlyShiftOnly, lateShiftOnly: form.lateShiftOnly,
      canWorkSaturdays: form.canWorkSaturdays,
      email: form.email.trim() || null,
      monthlyWorkHourLimit: form.monthlyWorkHourLimit ? Number(form.monthlyWorkHourLimit) : null,
      weeklyAvailableDays: form.weeklyAvailableDays ? Number(form.weeklyAvailableDays) : null,
      notes: form.notes.trim() || null,
    };
    await onSave(input);
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
    <form onSubmit={submit} className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl md:max-w-3xl md:rounded-2xl md:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-700">職員マスター</p><h3 id="staff-form-title" className="text-2xl font-bold">{staff ? '職員情報を編集' : '職員を新規登録'}</h3></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" aria-label="閉じる">✕</button></div>
      <p className="mt-2 text-sm text-slate-500"><span className="font-semibold text-rose-600">*</span> は必須項目です。</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="職員番号" required><input required maxLength={50} value={form.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} className="input" /></Field>
        <Field label="氏名" required><input required maxLength={100} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} className="input" /></Field>
        <Field label="メールアドレス"><input type="email" maxLength={254} value={form.email} onChange={(e) => set('email', e.target.value)} className="input" placeholder="任意" /></Field>
        <Field label="雇用形態" required><select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)} className="input">{employmentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label="担当クラス" required><select value={form.assignedClass} onChange={(e) => set('assignedClass', e.target.value as AssignedClass)} className="input">{classOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label="土曜日勤務"><Checkbox checked={form.canWorkSaturdays} onChange={(value) => set('canWorkSaturdays', value)} label="勤務可能" /></Field>
        <Field label="月間勤務時間上限"><input type="number" min={1} max={744} value={form.monthlyWorkHourLimit} onChange={(e) => set('monthlyWorkHourLimit', e.target.value)} className="input" placeholder="任意" /></Field>
        <Field label="週の勤務可能日数"><input type="number" min={1} max={7} value={form.weeklyAvailableDays} onChange={(e) => set('weeklyAvailableDays', e.target.value)} className="input" placeholder="1〜7日（任意）" /></Field>
      </div>
      <fieldset className="mt-5 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">勤務区分 <span className="text-rose-600">*</span></legend><div className="grid gap-3 sm:grid-cols-3"><Checkbox checked={form.canWorkEarly} onChange={(value) => set('canWorkEarly', value)} label="早出可能" /><Checkbox checked={form.canWorkRegular} onChange={(value) => set('canWorkRegular', value)} label="通常勤務可能" /><Checkbox checked={form.canWorkLate} onChange={(value) => set('canWorkLate', value)} label="遅出可能" /></div></fieldset>
      <fieldset className="mt-5 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">専任区分</legend><div className="grid gap-3 sm:grid-cols-2"><Checkbox checked={form.earlyShiftOnly} onChange={(value) => set('earlyShiftOnly', value)} label="早出専任" /><Checkbox checked={form.lateShiftOnly} onChange={(value) => set('lateShiftOnly', value)} label="遅出専任" /></div></fieldset>
      <Field label="備考" className="mt-5"><textarea maxLength={2000} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input resize-y" /></Field>
      {localError && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{localError}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-5 py-3 font-semibold">キャンセル</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{saving ? '保存中…' : '保存する'}</button></div>
    </form>
  </div>;
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) { return <label className={`block text-sm font-medium text-slate-700 ${className}`}>{label}{required && <span className="ml-1 text-rose-600">*</span>}<span className="mt-2 block">{children}</span></label>; }
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-emerald-700" />{label}</label>; }
