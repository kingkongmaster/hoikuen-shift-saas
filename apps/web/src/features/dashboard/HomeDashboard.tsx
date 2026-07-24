import { useEffect, useMemo, useState } from 'react';
import { api, type Notification, type Session, type ShiftAssignment, type ShiftType, type ShiftView } from '../../api/client';
import { SkeletonState } from '../../components/UiStates';
import { AdminHomeSummary } from './AdminHomeSummary';

const shiftLabels: Record<ShiftType, string> = {
  EARLY: '早出勤務', NORMAL: '通常勤務', LATE: '遅出勤務', OFF: 'お休み', PAID_LEAVE: '有給休暇', SUMMER_LEAVE: '夏季休暇', AM_HALF: '午前半休', PM_HALF: '午後半休', OTHER: 'その他',
};
const workingTypes = new Set<ShiftType>(['EARLY', 'NORMAL', 'LATE', 'AM_HALF', 'PM_HALF', 'OTHER']);

export function HomeDashboard({ session, notifications, onOpen }: { session: Session; notifications: Notification[]; onOpen: (view: 'shifts' | 'notifications' | 'requests' | 'swaps') => void }) {
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const today = localDateKey(new Date());
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAssignments(session).then(({ rows, confirmed }) => {
      if (active) { setAssignments(rows); setScheduleConfirmed(confirmed); }
    }).catch(() => { if (active) setAssignments([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);
  const todayAssignment = useMemo(() => assignments.find((item) => item.workDate.slice(0, 10) === today), [assignments, today]);
  const nextAssignment = useMemo(() => assignments.find((item) => item.workDate.slice(0, 10) > today && workingTypes.has(item.shiftType)), [assignments, today]);
  const unread = notifications.filter((item) => !item.isRead);
  if (loading) return <div><span className="sr-only" role="status">今日の予定を確認しています…</span><SkeletonState cards={3} label="今日の予定を確認しています…" /></div>;
  return <div className="space-y-5">
    <section className="today-card" aria-labelledby="today-shift-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">TODAY・{formatDate(today)}</p><h3 id="today-shift-title" className="mt-2 text-xl font-bold">今日の勤務</h3></div>
        <span className="status-label">{scheduleConfirmed ? '確定シフト' : '未確定'}</span>
      </div>
      {todayAssignment ? <div className="mt-6">
        <p className="text-3xl font-black tracking-tight text-[var(--brand-deep)]">{shiftLabels[todayAssignment.shiftType]}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Time label="出勤" value={todayAssignment.startTime ?? '—'} />
          <Time label="退勤" value={todayAssignment.endTime ?? '—'} />
        </div>
        {todayAssignment.assignedClass && <p className="mt-4 text-sm font-semibold text-[var(--ink-muted)]">担当：{classLabel(todayAssignment.assignedClass)}</p>}
      </div> : <div className="mt-6 rounded-2xl bg-white/75 p-5"><p className="text-lg font-bold">{scheduleConfirmed ? '今日は勤務登録がありません' : '今日の勤務はまだ確定していません'}</p><p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">確定後、この場所に出勤・退勤時刻が表示されます。</p></div>}
      <button type="button" onClick={() => onOpen('shifts')} className="btn-primary mt-6 w-full sm:w-fit"><span className="action-symbol" aria-hidden="true">勤</span>月間シフトを見る</button>
    </section>

    {(session.role === 'ADMIN' || session.role === 'DIRECTOR') && <AdminHomeSummary session={session} notifications={notifications} onOpen={onOpen} />}

    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="card" aria-labelledby="today-news-title">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">INFORMATION</p><h3 id="today-news-title" className="mt-1 text-xl font-bold">今日のお知らせ</h3></div><span className="count-label">未読 {unread.length}件</span></div>
        {notifications.length ? <ul className="mt-5 space-y-3">{notifications.slice(0, 3).map((item) => <li key={item.id} className="notice-row"><span className={`notice-dot ${item.isRead ? 'notice-dot-read' : ''}`} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.title}</p><span className="text-label">{item.isRead ? '確認済み' : '未読'}</span></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--ink-muted)]">{item.message}</p></div></li>)}</ul> : <div className="mt-5 rounded-xl bg-[var(--canvas)] p-4"><p className="font-bold">園からのお知らせはまだありません</p><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">新しいお知らせが届くと、この場所に表示されます。</p></div>}
        <button type="button" onClick={() => onOpen('notifications')} className="btn-secondary mt-5 w-full sm:w-fit"><span className="action-symbol action-symbol-soft" aria-hidden="true">知</span>通知をすべて見る</button>
      </section>
      <section className="card" aria-labelledby="next-shift-title">
        <p className="eyebrow">NEXT</p><h3 id="next-shift-title" className="mt-1 text-xl font-bold">次回勤務</h3>
        {nextAssignment ? <div className="mt-5"><p className="text-lg font-bold text-[var(--brand-deep)]">{formatDate(nextAssignment.workDate.slice(0, 10))}</p><p className="mt-2 text-2xl font-black">{shiftLabels[nextAssignment.shiftType]}</p><p className="mt-3 text-sm font-semibold text-[var(--ink-muted)]">{nextAssignment.startTime ?? '—'} 〜 {nextAssignment.endTime ?? '—'}</p></div> : <p className="mt-5 text-sm leading-6 text-[var(--ink-muted)]">確定済みの次回勤務はありません。</p>}
      </section>
    </div>
  </div>;
}

async function loadAssignments(session: Session) {
  const currentMonth = localDateKey(new Date()).slice(0, 7);
  const nextMonth = moveMonth(currentMonth, 1);
  let staffId: string | undefined;
  if (session.role === 'ADMIN') {
    const staff = await api.staff(session.accessToken);
    staffId = staff.find((item) => item.userId === session.user.id)?.id;
  }
  const [current, next] = await Promise.all([api.shifts(session.accessToken, currentMonth, staffId), api.shifts(session.accessToken, nextMonth, staffId)]);
  const own = (view: ShiftView) => session.role === 'ADMIN' && staffId
    ? view.assignments
    : session.role === 'DIRECTOR'
      ? view.assignments.filter((item) => item.staff.displayName === session.user.displayName)
      : view.assignments;
  const confirmed = current.schedule?.status === 'CONFIRMED';
  return { rows: [...(confirmed ? own(current) : []), ...(next.schedule?.status === 'CONFIRMED' ? own(next) : [])].sort((a, b) => a.workDate.localeCompare(b.workDate)), confirmed };
}
function Time({ label, value }: { label: string; value: string }) {
  return <div className="time-block"><p className="text-sm font-bold text-[var(--ink-muted)]">{label}</p><p className="mt-1 text-3xl font-black tracking-tight">{value}</p></div>;
}
function localDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function moveMonth(month: string, amount: number) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(`${value}T00:00:00+09:00`));
}
function classLabel(value: string) {
  return ({ AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' } as Record<string, string>)[value] ?? value;
}
