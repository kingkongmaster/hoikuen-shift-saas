import { useEffect, useMemo, useState } from 'react';
import { api, type AssignedClass, type ClosedDate, type GenerationResult, type GenerationWarning, type PrecheckResult, type Session, type ShiftAssignmentInput, type ShiftType, type ShiftView } from '../../api/client';
import { assignmentKey } from './assignment-key.js';
import { currentMonthKey, monthChangeReset, moveMonthKey } from './month-utils.js';
import { dailyDateKey, daysInMonth, initialDayForMonth, moveDayWithinMonth, weekdayLabel } from './daily-view-utils.js';
import { useFeature } from '../features/use-feature';

const labels: Record<ShiftType, string> = { EARLY: '早', NORMAL: '通', LATE: '遅', OFF: '休', PAID_LEAVE: '有', SUMMER_LEAVE: '夏', AM_HALF: '半', PM_HALF: '半', OTHER: '他' };
const fullLabels: Record<ShiftType, string> = { EARLY: '早出', NORMAL: '通常', LATE: '遅出', OFF: '休', PAID_LEAVE: '有給', SUMMER_LEAVE: '夏季', AM_HALF: '半休（午前）', PM_HALF: '半休（午後）', OTHER: 'その他勤務' };
const options = Object.entries(labels) as Array<[ShiftType, string]>;
const classes: Record<string, string> = { AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' };
const employment: Record<string, string> = { FULL_TIME: '正職員', PART_TIME: 'パート', REEMPLOYED: '再雇用' };
const classShortLabels: Record<string, string> = { AGE_0: '0歳', AGE_1: '1歳', AGE_2: '2歳', AGE_3: '3歳', AGE_4: '4歳', AGE_5: '5歳', FREE: 'F', SUPPORT: '補' };
const shiftCellClasses: Record<ShiftType, string> = { EARLY: 'shift-cell-early', NORMAL: 'shift-cell-normal', LATE: 'shift-cell-late', OFF: 'shift-cell-off', PAID_LEAVE: 'shift-cell-paid', SUMMER_LEAVE: 'shift-cell-summer', AM_HALF: 'shift-cell-half', PM_HALF: 'shift-cell-half', OTHER: 'shift-cell-other' };
const workingTypes = new Set<ShiftType>(['EARLY', 'NORMAL', 'LATE', 'OTHER']);
type ShiftDisplayMode = 'all' | 'emphasize' | 'dim-off';
const iso = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;
const days = daysInMonth;
type WarningLevel = 'INFO' | 'WARNING' | 'ERROR';
type WarningLike = { code: string; level: WarningLevel };
type DisplayWarning = { code: string; level: WarningLevel; workDate: string; staffId?: string; message: string };
const summarizeWarnings = (warnings: WarningLike[]) => warnings.reduce<{ INFO: number; WARNING: number; ERROR: number; byCode: Record<string, number> }>((summary, warning) => { summary[warning.level] += 1; summary.byCode[warning.code] = (summary.byCode[warning.code] ?? 0) + 1; return summary; }, { INFO: 0, WARNING: 0, ERROR: 0, byCode: {} });

export function ShiftManagement({ session }: { session: Session }) {
  const manager = session.role === 'ADMIN' || session.role === 'DIRECTOR';
  const basicGeneration = useFeature(session.accessToken, 'BASIC_SHIFT_GENERATION');
  const canGenerate = session.role === 'ADMIN' && basicGeneration.enabled;
  const [month, setMonth] = useState(currentMonthKey); const [selectedDay, setSelectedDay] = useState(() => initialDayForMonth(currentMonthKey())); const [view, setView] = useState<ShiftView | null>(null); const [changes, setChanges] = useState<Record<string, ShiftAssignmentInput>>({}); const [message, setMessage] = useState(''); const [generationWarnings, setGenerationWarnings] = useState<GenerationWarning[]>([]); const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null); const [precheck, setPrecheck] = useState<PrecheckResult | null>(null); const [closedDates, setClosedDates] = useState<ClosedDate[]>([]); const [loading, setLoading] = useState(true);
  const reloadMonthData = async (targetMonth: string) => { setLoading(true); try { const [nextView, nextClosed] = await Promise.all([api.shifts(session.accessToken, targetMonth), api.closedDates(session.accessToken, targetMonth)]); setView(nextView); setClosedDates(nextClosed); setChanges({}); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトを確認できませんでした。時間をおいてもう一度お試しください。'); } finally { setLoading(false); } };
  useEffect(() => { void reloadMonthData(month); }, [month]);
  const clearMonthScopedState = () => { const reset = monthChangeReset(); setChanges(reset.changes); setPrecheck(reset.precheck); setGenerationWarnings(reset.generationWarnings); setGenerationResult(reset.generationResult); setMessage(reset.message); };
  const changeMonth = (targetMonth: string) => { if (targetMonth === month) return; clearMonthScopedState(); setSelectedDay(initialDayForMonth(targetMonth)); setMonth(targetMonth); };
  const moveMonth = (offset: number) => changeMonth(moveMonthKey(month, offset));
  const moveToCurrentMonth = () => changeMonth(currentMonthKey());
  const assignmentMap = useMemo(() => new Map((view?.assignments ?? []).map((assignment) => [assignmentKey(assignment.staffId, assignment.workDate), assignment])), [view]);
  const requests = useMemo(() => new Map((view?.requests ?? []).map((request) => [`${request.staffId}:${request.requestDate.slice(0, 10)}`, request])), [view]);
  const closedNames = useMemo(() => new Map(closedDates.map((item) => [item.closedDate.slice(0, 10), item.name])), [closedDates]);
  const setType = (staffId: string, workDate: string, shiftType: ShiftType) => setChanges((current) => { const key = `${staffId}:${workDate}`; return { ...current, [key]: { staffId, workDate, shiftType, assignedClass: current[key]?.assignedClass ?? assignmentMap.get(key)?.assignedClass ?? null } }; });
  const setAssignedClass = (staffId: string, workDate: string, assignedClass: AssignedClass | null) => setChanges((current) => { const key = `${staffId}:${workDate}`; return { ...current, [key]: { staffId, workDate, shiftType: current[key]?.shiftType ?? assignmentMap.get(key)?.shiftType ?? 'OFF', assignedClass } }; });
  const cancelSelectedDayChanges = () => setChanges((current) => Object.fromEntries(Object.entries(current).filter(([, change]) => change.workDate.slice(0, 10) !== dailyDateKey(month, selectedDay))));
  const create = async () => { try { await api.createShift(session.accessToken, month); setMessage('下書きを作成しました。'); setGenerationWarnings([]); await reloadMonthData(month); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトの下書きを作成できませんでした。もう一度お試しください。'); } };
  const save = async () => { if (!view?.schedule || !Object.keys(changes).length) return; try { const saved = await api.saveAssignments(session.accessToken, view.schedule.id, Object.values(changes)); setView(saved); setChanges({}); setMessage('変更を保存しました。'); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトを保存できませんでした。入力内容を確認して、もう一度お試しください。'); } };
  const confirm = async () => { if (!view?.schedule || !window.confirm('この月のシフトを確定しますか？ 確定後に変更する場合は、いったん下書きへ戻す必要があります。')) return; try { await api.confirmShift(session.accessToken, view.schedule.id); setMessage('シフトを確定しました。職員の先生が確認できる状態になりました。'); await reloadMonthData(month); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトを確定できませんでした。表示された内容をご確認ください。'); } };
  const reopen = async () => { if (!view?.schedule || !window.confirm('確定済みのシフトを下書きに戻しますか？ 職員の先生には、再確定するまで表示されなくなります。')) return; try { await api.reopenShift(session.accessToken, view.schedule.id); setMessage('シフトを下書きに戻しました。変更後は、もう一度確定してください。'); await reloadMonthData(month); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトを下書きに戻せませんでした。もう一度お試しください。'); } };
  const printOwn = async () => { try { const data = await api.printShifts(session.accessToken, month, !manager); const rows = data.assignments.map((item) => `<tr><td>${item.staffName}</td><td>${item.date}（${item.weekday}）</td><td>${item.shiftType}</td><td>${item.assignedClass}</td><td>${item.startTime ?? ''}${item.endTime ? `〜${item.endTime}` : ''}</td></tr>`).join(''); const popup = window.open('', '_blank', 'noopener,noreferrer'); if (!popup) throw new Error('印刷画面を開けませんでした。ブラウザのポップアップ設定をご確認ください。'); popup.document.write(`<!doctype html><html lang="ja"><head><title>AeN Shift 月間シフト</title><style>@page{size:A4 landscape}body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:5px}@media print{button{display:none}}</style></head><body><h1>AeN Shift｜${data.tenantName} ${data.month} 月間シフト</h1><p>${data.status === 'CONFIRMED' ? '確定済み' : '下書き'}</p><table><tr><th>職員</th><th>日付</th><th>勤務区分</th><th>配置</th><th>勤務時間</th></tr>${rows}</table><button onclick="window.print()">印刷／PDFとして保存</button></body></html>`); popup.document.close(); } catch (error) { setMessage(error instanceof Error ? error.message : '印刷画面を表示できませんでした。時間をおいてもう一度お試しください。'); } };
  const generate = async () => { if (!view?.schedule || !window.confirm('シフトを自動作成しますか？ 現在の下書きは自動作成した内容に置き換わります。')) return; try { const result = await api.generateShift(session.accessToken, view.schedule.id); setGenerationWarnings(result.warnings); setGenerationResult(result); setMessage(`勤務を${result.workingAssignmentCount}件割り当てました。休み${result.offAssignmentCount}件・休暇${result.leaveAssignmentCount}件も勤務表へ反映しています。`); await reloadMonthData(month); } catch (error) { setMessage(error instanceof Error ? error.message : 'シフトを自動作成できませんでした。設定と職員情報をご確認ください。'); } };
  const runPrecheck = async () => { if (!view?.schedule) return; try { const result = await api.precheckShift(session.accessToken, view.schedule.id); setPrecheck(result); setMessage(result.canGenerate ? '自動作成の準備を確認しました。' : '自動作成の前に確認が必要な項目があります。'); } catch (error) { setMessage(error instanceof Error ? error.message : '自動作成の準備を確認できませんでした。もう一度お試しください。'); } };
  const status = view?.schedule?.status;
  const precheckSummary = precheck ? precheck.warningSummary ?? summarizeWarnings(precheck.warnings) : null;
  const displayedWarnings: DisplayWarning[] = [
    ...generationWarnings.map((warning) => ({ code: warning.code, level: warning.level, workDate: warning.workDate, staffId: warning.staffId, message: warning.message })),
    ...(view?.warnings ?? []).map((warning) => ({ code: warning.code, level: warning.severity === 'blocking' ? 'ERROR' as const : warning.severity === 'warning' ? 'WARNING' as const : 'INFO' as const, workDate: warning.workDate, staffId: warning.staffId, message: warning.message })),
  ];
  return <section className="mt-6"><div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-4"><button type="button" onClick={() => moveMonth(-1)} className="rounded-lg border px-3 py-2">前月</button><input aria-label="対象月" type="month" value={month} onChange={(event) => changeMonth(event.target.value)} className="rounded-lg border px-3 py-2" /><button type="button" onClick={() => moveMonth(1)} className="rounded-lg border px-3 py-2">次月</button><button type="button" disabled={month === currentMonthKey()} onClick={moveToCurrentMonth} className="rounded-lg border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">現在月</button>{manager && !view?.schedule && <button type="button" onClick={create} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">この月のシフトを作成</button>}{manager && status === 'DRAFT' && <>{canGenerate && <button type="button" onClick={runPrecheck} className="rounded-lg border border-violet-700 px-4 py-2 font-semibold text-violet-800">生成前チェック</button>}{canGenerate && <button type="button" onClick={generate} className="rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white">自動生成</button>}<button type="button" disabled={!Object.keys(changes).length} onClick={save} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white disabled:opacity-40">下書きを保存（{Object.keys(changes).length}件）</button><button type="button" onClick={confirm} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">シフトを確定</button></>}{manager && status === 'CONFIRMED' && <button type="button" onClick={reopen} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">下書きへ戻す</button>}{(!manager ? status === 'CONFIRMED' : !!status) && <button type="button" onClick={() => void printOwn()} className="rounded-lg border px-3 py-2">印刷／PDF保存</button>}<span className={`ml-auto rounded-full px-3 py-1 text-sm font-semibold ${status === 'CONFIRMED' ? 'bg-blue-100 text-blue-800' : status ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{status === 'CONFIRMED' ? '確定済み' : status ? '下書き' : '未作成'}</span></div>
    {message && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
    {loading ? <p className="p-8 text-slate-500">読み込み中…</p> : !view?.schedule ? <p className="mt-6 rounded-xl border bg-white p-6 text-slate-600">{manager ? 'この月のシフトはまだ作成されていません。' : 'この月のシフトはまだ確定していません。'}</p> : manager ? <>
      <div className="hidden min-w-0 max-w-full overflow-x-hidden [contain:paint] lg:block print:block print:max-w-none print:overflow-visible print:[contain:none]"><ManagerTable view={view} month={month} disabled={status !== 'DRAFT'} changes={changes} assignmentMap={assignmentMap} requests={requests} closedNames={closedNames} onChange={setType} onClassChange={setAssignedClass} /></div>
      <div className="lg:hidden print:hidden"><ManagerDailyCards view={view} month={month} selectedDay={selectedDay} disabled={status !== 'DRAFT'} changes={changes} assignmentMap={assignmentMap} requests={requests} warnings={displayedWarnings} closedNames={closedNames} onDayChange={setSelectedDay} onChange={setType} onClassChange={setAssignedClass} onCancel={cancelSelectedDayChanges} /></div>
    </> : <PersonalSchedule assignments={view.assignments} month={month} closedNames={closedNames} />}
    {precheck && precheckSummary && <aside className="mt-5 rounded-xl border border-violet-300 bg-violet-50 p-4"><h3 className="font-bold">生成前チェック：{precheck.canGenerate ? '生成可能' : '要確認'}</h3><p className="mt-2 text-sm">有効職員 {precheck.summary.activeStaffCount}人／早出可能 {precheck.summary.earlyCapableCount}人／遅出可能 {precheck.summary.lateCapableCount}人／土曜可能 {precheck.summary.saturdayCapableCount}人／休園日 {precheck.summary.closedDateCount}件</p><WarningSummary summary={precheckSummary} /><details className="mt-2"><summary>詳細警告を表示</summary><ul className="mt-2 list-disc pl-5 text-sm">{precheck.warnings.map((item,index) => <li key={index}>[{item.level}] {item.code}: {item.message}</li>)}</ul></details></aside>}
    {generationResult && <aside className="mt-5 rounded-xl border border-violet-300 bg-violet-50 p-4"><h3 className="font-bold">自動生成結果</h3><p className="mt-2 text-sm font-semibold">勤務 {generationResult.workingAssignmentCount}件・休み {generationResult.offAssignmentCount}件・休暇 {generationResult.leaveAssignmentCount}件</p><p className="mt-1 text-xs text-slate-600">全明細 {generationResult.generatedCount}件／{generationResult.durationMs}ms／休園日 {generationResult.closedDateCount}件</p><WarningSummary summary={generationResult.warningSummary} /><details className="mt-2"><summary>詳細警告を表示</summary><ul className="mt-2 list-disc pl-5 text-sm">{generationWarnings.map((warning, index) => <li key={`detail-${warning.code}-${index}`}>[{warning.level}] {warning.workDate} {warning.code}: {warning.message}</li>)}</ul></details>{generationResult.staffingRequirementEvaluations?.length ? <div className="mt-4 border-t border-violet-200 pt-3"><h4 className="font-semibold">属性別配置条件の評価</h4><p className="mt-1 text-xs text-slate-600">HARDは必須条件、SOFTは優先条件、INFOは確認用条件です。</p><ul className="mt-2 space-y-2 text-sm">{generationResult.staffingRequirementEvaluations.map((item) => <li key={`${item.requirementId}-${item.date}`} className={`rounded border p-2 ${item.level==='ERROR'?'border-rose-300 bg-rose-50':item.level==='WARNING'?'border-amber-300 bg-amber-50':'border-sky-300 bg-sky-50'}`}><strong>[{item.constraintLevel}] {item.name}</strong>／{item.date}／{item.classType?`${item.classType.replace('AGE_','')}歳児クラス`:'園全体'}／必要 {item.requiredCount}名・実績 {item.actualCount}名<br/><span>{item.message}</span></li>)}</ul></div>:null}</aside>}
    {manager && displayedWarnings.length ? <WarningPanel warnings={displayedWarnings} /> : null}</section>;
}

function WarningSummary({ summary }: { summary: { INFO: number; WARNING: number; ERROR: number; byCode: Record<string, number> } }) { return <><p className="mt-2 text-sm font-semibold">ERROR {summary.ERROR}件・WARNING {summary.WARNING}件・INFO {summary.INFO}件</p><details className="mt-2"><summary>警告コード別件数</summary><ul className="mt-2 list-disc pl-5 text-sm">{Object.entries(summary.byCode).map(([code, count]) => <li key={code}>{code}: {count}件</li>)}</ul></details></>; }

function WarningPanel({ warnings }: { warnings: DisplayWarning[] }) {
  const styles: Record<WarningLevel, string> = { ERROR: 'border-red-300 bg-red-50 text-red-900', WARNING: 'border-amber-300 bg-amber-50 text-amber-900', INFO: 'border-sky-300 bg-sky-50 text-sky-900' };
  const labels: Record<WarningLevel, string> = { ERROR: 'エラー', WARNING: '確認', INFO: 'お知らせ' };
  return <aside className="mt-5 rounded-xl border border-slate-300 bg-white p-4">
    <details>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 font-bold">
        <span>勤務条件の確認が必要です <span className="whitespace-nowrap">{warnings.length}件</span></span>
        <span className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold">内容を確認する</span>
      </summary>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning, index) => <li key={`${warning.code}-${warning.workDate}-${index}`} className={`rounded-lg border p-3 text-sm ${styles[warning.level]}`}>
          <span className="mr-2 inline-block rounded border border-current px-2 py-0.5 text-xs font-bold">{labels[warning.level]}</span>
          <span>{warning.workDate} {warning.message}</span>
        </li>)}
      </ul>
    </details>
  </aside>;
}

function ManagerDailyCards({ view, month, selectedDay, disabled, changes, assignmentMap, requests, warnings, closedNames, onDayChange, onChange, onClassChange, onCancel }: { view: ShiftView; month: string; selectedDay: number; disabled: boolean; changes: Record<string, ShiftAssignmentInput>; assignmentMap: Map<string, ShiftView['assignments'][number]>; requests: Map<string, any>; warnings: DisplayWarning[]; closedNames: Map<string, string>; onDayChange: (day: number) => void; onChange: (staffId: string, workDate: string, type: ShiftType) => void; onClassChange: (staffId: string, workDate: string, assignedClass: AssignedClass | null) => void; onCancel: () => void }) {
  const dateCount = days(month);
  const workDate = dailyDateKey(month, selectedDay);
  const weekday = weekdayLabel(month, selectedDay);
  const isCurrentMonth = month === currentMonthKey();
  const resetDay = initialDayForMonth(month);
  const selectedWarnings = warnings.filter((warning) => warning.workDate.slice(0, 10) === workDate);
  const hasDayChanges = Object.values(changes).some((change) => change.workDate.slice(0, 10) === workDate);
  const warningStyles: Record<WarningLevel, string> = { ERROR: 'border-rose-300 bg-rose-50 text-rose-900', WARNING: 'border-amber-300 bg-amber-50 text-amber-900', INFO: 'border-sky-300 bg-sky-50 text-sky-900' };
  const warningLabels: Record<WarningLevel, string> = { ERROR: 'ERROR・重要な問題', WARNING: 'WARNING・要確認', INFO: 'INFO・参考情報' };

  return <section className="mt-5" data-testid="mobile-daily-shift-view">
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">日付別シフト・{month}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button type="button" aria-label="前日" disabled={selectedDay <= 1} onClick={() => onDayChange(moveDayWithinMonth(month, selectedDay, -1))} className="min-w-24 rounded-xl border px-4 py-3 font-bold disabled:opacity-40">← 前日</button>
        <div className="min-w-0 text-center" aria-live="polite"><p className="text-2xl font-black">{selectedDay}日</p><p className="font-bold">{weekday}曜日</p></div>
        <button type="button" aria-label="翌日" disabled={selectedDay >= dateCount} onClick={() => onDayChange(moveDayWithinMonth(month, selectedDay, 1))} className="min-w-24 rounded-xl border px-4 py-3 font-bold disabled:opacity-40">翌日 →</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">日付を選択<input aria-label="表示日" type="date" min={`${month}-01`} max={`${month}-${String(dateCount).padStart(2, '0')}`} value={workDate} onChange={(event) => { const nextDay = Number(event.target.value.slice(-2)); if (nextDay >= 1 && nextDay <= dateCount) onDayChange(nextDay); }} className="input mt-1" /></label>
        <button type="button" onClick={() => onDayChange(resetDay)} className="self-end rounded-xl border px-4 py-3 font-bold">{isCurrentMonth ? '今日へ戻る' : '月初へ戻る'}</button>
      </div>
      {closedNames.get(workDate) && <p className="mt-3 rounded-lg bg-slate-200 p-3 text-sm font-bold">休園日：{closedNames.get(workDate)}</p>}
      {hasDayChanges && <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl border border-slate-400 px-4 py-3 font-bold">この日の変更を取り消す</button>}
    </div>

    {selectedWarnings.length > 0 && <aside className="mt-4 space-y-2" aria-label="選択日の注意・警告">{selectedWarnings.map((warning, index) => <div key={`${warning.code}-${index}`} className={`rounded-xl border p-3 text-sm ${warningStyles[warning.level]}`}><strong className="block">{warningLabels[warning.level]}</strong><span>{warning.message}</span></div>)}</aside>}

    <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label={`${workDate}の職員勤務`}>
      {view.staff.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-600">表示できる職員がいません。</p> : view.staff.map((staff) => {
        const key = assignmentKey(staff.id, workDate);
        const saved = assignmentMap.get(key);
        const value = changes[key]?.shiftType ?? saved?.shiftType ?? 'OFF';
        const selectedClass = changes[key]?.assignedClass === undefined ? saved?.assignedClass : changes[key].assignedClass;
        const isWorking = workingTypes.has(value);
        const request = requests.get(key);
        const patternName = value === 'OTHER' && saved?.shiftType === value ? saved.workPattern?.name : null;
        const shiftName = patternName ?? fullLabels[value];
        const cardWarnings = selectedWarnings.filter((warning) => !warning.staffId || warning.staffId === staff.id);
        const showSavedTime = saved?.shiftType === value && saved.startTime && saved.endTime;
        return <article key={staff.id} data-testid="daily-staff-card" className={`min-w-0 rounded-2xl border p-4 shadow-sm ${shiftCellClasses[value]}`}>
          <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-black">{staff.displayName}</h3><p className="text-sm">{employment[staff.employmentType]}・{classes[staff.assignedClass]}</p></div><span className="shrink-0 rounded-full border border-current bg-white/70 px-3 py-1 text-sm font-black">{shiftName}</span></div>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline font-bold">勤務種別：</dt><dd className="inline">{shiftName}</dd></div>
            {showSavedTime && <div><dt className="inline font-bold">勤務時間：</dt><dd className="inline">{saved.startTime}〜{saved.endTime}</dd></div>}
            {selectedClass && <div><dt className="inline font-bold">担当：</dt><dd className="inline">{classes[selectedClass]}</dd></div>}
            {request && <div><dt className="inline font-bold">希望休：</dt><dd className="inline">{request.status === 'APPROVED' ? '承認済み' : '申請中'}</dd></div>}
          </dl>
          {cardWarnings.map((warning, index) => <p key={`${warning.code}-${index}`} className={`mt-2 rounded-lg border p-2 text-xs font-semibold ${warningStyles[warning.level]}`}><strong>{warningLabels[warning.level]}</strong><br />{warning.message}</p>)}
          <div className="mt-4 grid gap-3">
            <label className="text-sm font-bold">勤務パターン<select aria-label={`${staff.displayName} ${workDate} 勤務パターン`} disabled={disabled} value={value} onChange={(event) => onChange(staff.id, workDate, event.target.value as ShiftType)} className="input mt-1 disabled:opacity-60">{options.map(([type]) => <option key={type} value={type}>{fullLabels[type]}</option>)}</select></label>
            {isWorking && <label className="text-sm font-bold">担当クラス・配置先<select aria-label={`${staff.displayName} ${workDate} 担当クラス`} disabled={disabled} value={selectedClass ?? ''} onChange={(event) => onClassChange(staff.id, workDate, (event.target.value || null) as AssignedClass | null)} className="input mt-1 disabled:opacity-60"><option value="">未設定</option>{Object.entries(classes).map(([classValue, label]) => <option key={classValue} value={classValue}>{label}</option>)}</select></label>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function ManagerTable({ view, month, disabled, changes, assignmentMap, requests, closedNames, onChange, onClassChange }: { view: ShiftView; month: string; disabled: boolean; changes: Record<string, ShiftAssignmentInput>; assignmentMap: Map<string, ShiftView['assignments'][number]>; requests: Map<string, any>; closedNames: Map<string, string>; onChange: (staffId: string, workDate: string, type: ShiftType) => void; onClassChange: (staffId: string, workDate: string, assignedClass: AssignedClass | null) => void }) {
  const dateCount = days(month);
  const [displayMode, setDisplayMode] = useState<ShiftDisplayMode>('emphasize');
  const effectiveType = (staffId: string, workDate: string) => changes[assignmentKey(staffId, workDate)]?.shiftType ?? assignmentMap.get(assignmentKey(staffId, workDate))?.shiftType ?? 'OFF';
  const dailyCounts = new Map(Array.from({ length: dateCount }, (_, index) => {
    const workDate = iso(month, index + 1);
    const values = view.staff.map((staff) => effectiveType(staff.id, workDate));
    return [workDate, { working: values.filter((type) => workingTypes.has(type)).length, early: values.filter((type) => type === 'EARLY').length, late: values.filter((type) => type === 'LATE').length, off: values.filter((type) => !workingTypes.has(type)).length }];
  }));
  return <div className="mt-5">
    <fieldset className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3" aria-label="シフト表の表示切替">
      <legend className="px-1 text-sm font-bold">表示</legend>
      {([['all','全員表示'],['emphasize','出勤者を強調'],['dim-off','休みを薄く表示']] as Array<[ShiftDisplayMode,string]>).map(([value,label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${displayMode === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'bg-white text-slate-700'}`}><input type="radio" name="shift-display-mode" value={value} checked={displayMode === value} onChange={() => setDisplayMode(value)} />{label}</label>)}
    </fieldset>
    <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-700" aria-label="勤務表の凡例">
      {([['shift-cell-normal','通＝通常'],['shift-cell-early','早＝早出'],['shift-cell-late','遅＝遅出'],['shift-cell-off','休＝休み'],['shift-cell-request','希＝希望休'],['shift-cell-paid','有＝有給'],['shift-cell-summer','夏＝夏季'],['shift-cell-half','半＝半休']] as Array<[string,string]>).map(([style,label]) => <span key={label} className={`rounded border px-2 py-1 font-semibold ${style}`}>{label}</span>)}
      <span className="rounded border px-2 py-1">勤務の下段＝担当クラス</span>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-white" role="region" aria-label="月間シフト表" tabIndex={0}>
      <table className={`min-w-max border-collapse text-xs shift-table-mode-${displayMode}`}>
        <thead><tr className="bg-slate-100"><th className="sticky left-0 z-10 border bg-slate-100 px-3 py-3 text-left">職員</th>{Array.from({ length: dateCount }, (_, index) => {
          const day = index + 1; const workDate = iso(month,day); const weekend = new Date(`${workDate}T00:00:00`).getDay(); const closed = closedNames.get(workDate); const count = dailyCounts.get(workDate)!; const summary = `出勤 ${count.working}人、早出 ${count.early}人、遅出 ${count.late}人、休み ${count.off}人`;
          return <th key={day} title={closed ? `${closed}。${summary}` : summary} aria-label={`${day}日 ${['日','月','火','水','木','金','土'][weekend]}曜日。${closed ? `休園日 ${closed}。` : ''}${summary}`} className={`min-w-14 border px-1 py-2 ${closed ? 'bg-slate-300 text-slate-800' : weekend === 0 ? 'bg-red-50 text-red-700' : weekend === 6 ? 'bg-blue-50 text-blue-700' : ''}`}><div>{day}</div><div>{['日', '月', '火', '水', '木', '金', '土'][weekend]}</div><div className="mt-1 rounded bg-white/80 px-1 py-0.5 text-[10px] font-black text-slate-800">{count.working}人</div><span className="sr-only">{summary}</span>{closed && <div className="text-[9px]">休園</div>}</th>;
        })}<th className="sticky right-0 z-10 min-w-32 border bg-slate-100 px-3 py-3 text-left">月間集計</th></tr></thead>
        <tbody>{view.staff.map((staff) => <tr key={staff.id}><th className="sticky left-0 z-10 border bg-white px-3 py-2 text-left"><div className="font-semibold">{staff.displayName}</div><div className="font-normal text-slate-500">{employment[staff.employmentType]}・{classes[staff.assignedClass]}</div>{staff.regularWorkStartTime && staff.regularWorkEndTime && <div className="mt-1 whitespace-nowrap text-[10px] font-semibold text-emerald-700">通常 {staff.regularWorkStartTime}〜{staff.regularWorkEndTime}</div>}</th>{Array.from({ length: dateCount }, (_, index) => {
          const workDate = iso(month, index + 1); const key = assignmentKey(staff.id, workDate); const saved = assignmentMap.get(key); const value = effectiveType(staff.id, workDate); const selectedClass = changes[key]?.assignedClass === undefined ? saved?.assignedClass : changes[key].assignedClass; const request = requests.get(key); const approvedRequest = request?.status === 'APPROVED'; const isWorking = workingTypes.has(value); const requestLabel = request ? `${approvedRequest ? '承認済み' : '申請中'}希望休` : ''; const assignedClass = selectedClass ? classes[selectedClass] : ''; const dutyLabel = staff.isDirector && isWorking ? (assignedClass ? `${assignedClass}応援` : '運営') : assignedClass; const dutyAccessible = dutyLabel ? `${staff.isDirector ? '担当' : '担当クラス'} ${dutyLabel}` : ''; const time = saved?.startTime && saved?.endTime ? `${saved.startTime}から${saved.endTime}` : ''; const accessible = [staff.displayName, workDate, fullLabels[value], requestLabel, dutyAccessible, time].filter(Boolean).join('。');
          const pattern = assignmentMap.get(key)?.workPattern; const cellClass = approvedRequest && value === 'OFF' ? 'shift-cell-request' : shiftCellClasses[value];
          return <td key={workDate} className={`shift-cell border p-1 ${cellClass} ${isWorking ? 'is-working' : 'is-off'}`} title={accessible}>
            <select aria-label={accessible} title={pattern?.name ?? fullLabels[value]} disabled={disabled} value={value} onChange={(event) => onChange(staff.id, workDate, event.target.value as ShiftType)} className={`shift-select w-12 rounded border px-1 py-1 font-black focus:ring-2 focus:ring-emerald-700 ${changes[key] ? 'border-emerald-700 bg-white' : 'border-current bg-white/70'}`}>{options.map(([type, label]) => <option key={type} value={type}>{type === value && pattern ? pattern.shortName : label}</option>)}</select>
            {isWorking && dutyLabel && <span className="block text-center text-[9px] font-black" aria-label={`担当 ${dutyLabel}`}>{staff.isDirector ? dutyLabel : saved?.assignedClass ? classShortLabels[saved.assignedClass] : ''}</span>}
            {staff.isDirector && isWorking && !disabled && <select aria-label={`${staff.displayName} ${workDate} 応援先`} value={selectedClass ?? ''} onChange={(event) => onClassChange(staff.id, workDate, (event.target.value || null) as AssignedClass | null)} className="mt-1 w-12 rounded border bg-white text-[9px]"><option value="">運営</option>{Object.entries(classes).filter(([key]) => key.startsWith('AGE_')).map(([key,label]) => <option key={key} value={key}>{label}応援</option>)}</select>}
            {request && <span aria-label={requestLabel} className="block text-center text-[10px] font-black">{approvedRequest ? '希✓' : '希'}</span>}
          </td>;
        })}<td className="sticky right-0 border bg-white px-3 py-2">{(() => { const summary = view.summaries?.find((item) => item.staffId === staff.id); const daysDifference = summary?.workDaysDifference; const minutesDifference = summary?.workMinutesDifference; return <><div className="font-bold">勤務日数：{summary?.workDays ?? 0} / {summary?.targetWorkDays ?? '未設定'}日{daysDifference != null && <span>（{signed(daysDifference)}日）</span>}</div><div className="mt-1 whitespace-nowrap text-slate-600">勤務時間：{formatMinutes(summary?.workMinutes ?? 0)} / {summary?.targetWorkMinutes != null ? formatMinutes(summary.targetWorkMinutes) : '未設定'}{minutesDifference != null && <span>（{signedHours(minutesDifference)}）</span>}</div><div className="mt-1 text-slate-600">上限：{summary?.monthlyWorkHourLimit != null ? `${summary.monthlyWorkHourLimit}時間` : '未設定'}</div><div className="mt-1 flex flex-wrap gap-1">{summary?.statuses.map((status) => <span key={status} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${status === '上限超過' ? 'bg-rose-100 text-rose-800' : status === '目標未達' || status === '上限接近' ? 'bg-amber-100 text-amber-800' : status === '目標超過' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{status}</span>)}</div></>; })()}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest ? `${hours}時間${rest}分` : `${hours}時間`; }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function signedHours(minutes: number) { const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : ''; return `${sign}${formatMinutes(Math.abs(minutes))}`; }
function PersonalSchedule({ assignments, month, closedNames }: { assignments: ShiftView['assignments']; month: string; closedNames: Map<string,string> }) { const map = new Map(assignments.map((assignment) => [assignment.workDate.slice(0, 10), assignment])); return <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: days(month) }, (_, index) => { const date = iso(month, index + 1); const assignment = map.get(date); const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date(`${date}T00:00:00`).getDay()]; return <article key={date} className="rounded-xl border bg-white p-4"><div className="flex justify-between"><strong>{index + 1}日（{weekday}）</strong><span className="rounded bg-slate-100 px-2 py-1">{assignment ? assignment.workPattern?.shortName ?? labels[assignment.shiftType] : '未設定'}</span></div>{closedNames.get(date) && <p className="mt-2 text-sm font-semibold text-slate-700">休園日：{closedNames.get(date)}</p>}{assignment && <p className="mt-2 text-sm text-slate-600">{assignment.startTime && assignment.endTime ? `${assignment.startTime}〜${assignment.endTime}` : '勤務時間未設定'}{assignment.assignedClass ? `／配置 ${classes[assignment.assignedClass]}` : ''}{assignment.note ? `／${assignment.note}` : ''}</p>}</article>; })}</div>; }
