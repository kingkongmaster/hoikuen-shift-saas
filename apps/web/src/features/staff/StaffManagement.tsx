import { useCallback, useEffect, useState } from 'react';
import { api, type AssignedClass, type EmploymentType, type Staff, type StaffInput } from '../../api/client';
import { StaffFormModal } from './StaffFormModal';

const employmentLabels: Record<EmploymentType, string> = { FULL_TIME: '正規職員', PART_TIME: 'パート', REEMPLOYED: '再雇用' };
const classLabels: Record<AssignedClass, string> = { AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' };

export function StaffManagement({ token }: { token: string }) {
  const [staff, setStaff] = useState<Staff[]>([]); const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Staff | null | undefined>(undefined); const [deactivating, setDeactivating] = useState<Staff | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setStaff(await api.staff(token, includeInactive)); } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '職員情報を確認できませんでした。時間をおいてもう一度お試しください。' }); } finally { setLoading(false); } }, [includeInactive, token]);
  useEffect(() => { void load(); }, [load]);

  async function save(input: StaffInput) {
    setSaving(true); setMessage(null);
    try { if (editing) await api.updateStaff(token, editing.id, input); else await api.createStaff(token, input); setEditing(undefined); setMessage({ kind: 'success', text: editing ? '職員情報を更新しました。' : '職員を登録しました。' }); await load(); }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '職員情報を保存できませんでした。入力内容を確認して、もう一度お試しください。' }); }
    finally { setSaving(false); }
  }

  async function deactivate() {
    if (!deactivating) return; setSaving(true); setMessage(null);
    try { await api.deactivateStaff(token, deactivating.id); setDeactivating(null); setMessage({ kind: 'success', text: `${deactivating.displayName}さんを無効化しました。` }); await load(); }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '職員を無効にできませんでした。時間をおいてもう一度お試しください。' }); }
    finally { setSaving(false); }
  }

  return <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-bold">職員マスター</h3><p className="mt-1 text-sm text-slate-600">職員の登録・編集・無効化を管理します。</p></div><button onClick={() => setEditing(null)} className="btn-primary"><span className="action-symbol bg-white/15" aria-hidden="true">職</span>職員を登録</button></div>
    <label className="mt-5 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="h-5 w-5 accent-emerald-700" />無効な職員も表示する</label>
    {message && <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p>}
    {loading ? <p className="py-10 text-center text-slate-500">読み込み中…</p> : staff.length === 0 ? <p className="py-10 text-center text-slate-500">表示できる職員がいません。</p> : <>
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{['職員番号','氏名','雇用形態','担当クラス','勤務区分','土曜','状態','操作'].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y">{staff.map((member) => <tr key={member.id} className={!member.isActive ? 'bg-slate-50 text-slate-500' : ''}><td className="px-3 py-4 font-mono text-xs">{member.employeeNumber}</td><td className="px-3 py-4 font-medium">{member.displayName}</td><td className="px-3 py-4">{employmentLabels[member.employmentType]}</td><td className="px-3 py-4">{classLabels[member.assignedClass]}</td><td className="px-3 py-4">{workLabels(member)}</td><td className="px-3 py-4">{member.canWorkSaturdays ? '可' : '不可'}</td><td className="px-3 py-4"><Status active={member.isActive} /></td><td className="px-3 py-4"><Actions member={member} onEdit={() => setEditing(member)} onDeactivate={() => setDeactivating(member)} /></td></tr>)}</tbody></table></div>
      <div className="mt-5 grid gap-4 md:hidden">{staff.map((member) => <article key={member.id} className={`rounded-xl border p-4 ${member.isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{member.employeeNumber}</p><h4 className="mt-1 text-lg font-bold">{member.displayName}</h4></div><Status active={member.isActive} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><Item label="雇用形態" value={employmentLabels[member.employmentType]} /><Item label="担当クラス" value={classLabels[member.assignedClass]} /><Item label="勤務区分" value={workLabels(member)} /><Item label="土曜日勤務" value={member.canWorkSaturdays ? '可' : '不可'} /></dl><div className="mt-4"><Actions member={member} onEdit={() => setEditing(member)} onDeactivate={() => setDeactivating(member)} /></div></article>)}</div>
    </>}
    {editing !== undefined && <StaffFormModal staff={editing ?? undefined} saving={saving} onClose={() => setEditing(undefined)} onSave={save} />}
    {deactivating && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="alertdialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-xl font-bold">職員を無効化しますか？</h3><p className="mt-3 text-slate-600">{deactivating.displayName}さんは通常の職員一覧に表示されなくなります。データは削除されません。</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setDeactivating(null)} className="rounded-lg border px-5 py-3 font-semibold">キャンセル</button><button disabled={saving} onClick={() => void deactivate()} className="rounded-lg bg-rose-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{saving ? '処理中…' : '無効化する'}</button></div></div></div>}
  </section>;
}

function workLabels(staff: Staff) { const labels = [staff.canWorkEarly && '早出', staff.canWorkRegular && '通常', staff.canWorkLate && '遅出'].filter(Boolean); return `${labels.join('・')}${staff.earlyShiftOnly ? '（早出専任）' : staff.lateShiftOnly ? '（遅出専任）' : ''}`; }
function Status({ active }: { active: boolean }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{active ? '有効' : '無効'}</span>; }
function Actions({ member, onEdit, onDeactivate }: { member: Staff; onEdit: () => void; onDeactivate: () => void }) { return <div className="flex gap-2"><button disabled={!member.isActive} onClick={onEdit} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">編集</button>{member.isActive && <button onClick={onDeactivate} className="min-h-10 rounded-lg border border-rose-200 px-3 py-2 font-semibold text-rose-700">無効化</button>}</div>; }
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
