import { useEffect, useMemo, useState } from 'react';
import { api, type MyCalendar, type ShiftRequestStatus, type ShiftType } from '../../api/client';
import { SkeletonState } from '../../components/UiStates';

const shiftInfo: Record<ShiftType, { short: string; label: string; style: string }> = {
  EARLY: { short: '早', label: '早出', style: 'shift-cell-early' },
  NORMAL: { short: '通', label: '通常勤務', style: 'shift-cell-normal' },
  LATE: { short: '遅', label: '遅出', style: 'shift-cell-late' },
  OFF: { short: '休', label: '休み', style: 'shift-cell-off' },
  PAID_LEAVE: { short: '有', label: '有給', style: 'shift-cell-paid' },
  SUMMER_LEAVE: { short: '夏', label: '夏季休暇', style: 'shift-cell-summer' },
  AM_HALF: { short: '午前休', label: '午前半休', style: 'shift-cell-half' },
  PM_HALF: { short: '午後休', label: '午後半休', style: 'shift-cell-half' },
  OTHER: { short: '他', label: 'その他', style: 'shift-cell-other' },
};
const requestInfo: Record<ShiftRequestStatus, { short: string; label: string }> = {
  PENDING: { short: '申請中', label: '希望休申請中' },
  APPROVED: { short: '承認済', label: '希望休承認済み' },
  REJECTED: { short: '却下', label: '希望休却下' },
  CANCELLED: { short: '取消', label: '希望休取消済み' },
};
const requestTypeLabels: Record<string, string> = { DAY_OFF: '希望休', PAID_LEAVE: '有給', SUMMER_LEAVE: '夏季休暇', BEREAVEMENT: '忌引', HALF_DAY_AM: '午前半休', HALF_DAY_PM: '午後半休', OTHER: 'その他' };

export function PersonalCalendar({ token }: { token: string }) {
  const [month, setMonth] = useState(() => tokyoToday().slice(0, 7));
  const [data, setData] = useState<MyCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSelectedDate(null);
    api.myCalendar(token, month).then((result) => { if (active) setData(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'カレンダーを取得できませんでした。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, token]);

  const assignments = useMemo(() => new Map(data?.assignments.map((row) => [row.workDate.slice(0, 10), row])), [data]);
  const requests = useMemo(() => {
    const rows = new Map<string, MyCalendar['requests']>();
    for (const request of data?.requests ?? []) { const date = request.requestDate.slice(0, 10); rows.set(date, [...(rows.get(date) ?? []), request]); }
    return rows;
  }, [data]);
  const days = calendarDays(month);
  const selectedAssignment = selectedDate ? assignments.get(selectedDate) : undefined;
  const selectedRequests = selectedDate ? requests.get(selectedDate) ?? [] : [];

  if (loading) return <SkeletonState cards={3} label="個人カレンダーを読み込んでいます…" />;
  return <div className="space-y-5" data-testid="personal-calendar">
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 font-bold text-rose-800">{error}</p>}
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-quiet" onClick={() => setMonth(moveMonth(month, -1))} aria-label="前月を表示">← 前月</button>
        <div className="text-center"><p className="eyebrow">MY CALENDAR</p><h2 className="mt-1 text-xl font-black">{monthLabel(month)}</h2></div>
        <button type="button" className="btn-quiet" onClick={() => setMonth(moveMonth(month, 1))} aria-label="翌月を表示">翌月 →</button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-bold" aria-label="シフト公開状態">
        <span className="status-label">{data?.schedule?.status === 'CONFIRMED' ? '✓ 確定済みシフト' : data?.schedule?.status === 'DRAFT' ? '△ 未確定シフト' : '— シフト未作成'}</span>
        <span className="text-label">色＋略号で表示</span>
      </div>
      <div className="calendar-grid mt-5" role="grid" aria-label={`${monthLabel(month)}の本人勤務カレンダー`}>
        {['日','月','火','水','木','金','土'].map((day) => <div key={day} role="columnheader" className="py-2 text-center text-xs font-black text-[var(--ink-muted)]">{day}</div>)}
        {days.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="min-h-20" aria-hidden="true" />;
          const assignment = assignments.get(date);
          const dayRequests = requests.get(date) ?? [];
          const info = assignment ? shiftInfo[assignment.shiftType] : null;
          return <button key={date} type="button" role="gridcell" onClick={() => setSelectedDate(date)} className={`calendar-day ${selectedDate === date ? 'is-selected' : ''}`} aria-label={dayLabel(date, assignment?.shiftType, dayRequests)}>
            <span className="calendar-day-number">{Number(date.slice(-2))}</span>
            {info && <span className={`calendar-shift ${info.style}`}><strong>{info.short}</strong><span>{info.label}</span></span>}
            {dayRequests.map((request) => <span key={request.id} className={`calendar-request request-${request.status.toLowerCase()}`}>{requestInfo[request.status].short}</span>)}
          </button>;
        })}
      </div>
    </section>

    <section className="card" aria-live="polite" aria-labelledby="calendar-detail-title">
      <p className="eyebrow">DETAIL</p><h3 id="calendar-detail-title" className="mt-1 text-xl font-black">{selectedDate ? formatDate(selectedDate) : '日付を選択してください'}</h3>
      {!selectedDate ? <p className="mt-4 text-sm text-[var(--ink-muted)]">カレンダーの日付を押すと、勤務時間・休憩・希望休の状態を確認できます。</p> : <div className="mt-5 space-y-4">
        {selectedAssignment ? <div className={`rounded-xl border p-4 ${shiftInfo[selectedAssignment.shiftType].style}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-black">{shiftInfo[selectedAssignment.shiftType].short}｜{shiftInfo[selectedAssignment.shiftType].label}</p><span className="text-label">✓ 確定済み</span></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><Detail label="開始" value={selectedAssignment.startTime ?? '—'} /><Detail label="終了" value={selectedAssignment.endTime ?? '—'} /><Detail label="休憩" value={selectedAssignment.breakMinutes == null ? '—' : `${selectedAssignment.breakMinutes}分`} /><Detail label="勤務種別" value={shiftInfo[selectedAssignment.shiftType].label} /></dl>
          {data?.schedule?.confirmedAt && selectedAssignment.updatedAt > data.schedule.confirmedAt && <p className="mt-3 font-bold">！確定後に変更された勤務です</p>}
        </div> : <p className="rounded-xl bg-[var(--canvas)] p-4 font-bold">{data?.schedule?.status === 'DRAFT' ? '△ この月のシフトは未確定です' : 'この日の勤務登録はありません'}</p>}
        {selectedRequests.map((request) => <div key={request.id} className={`calendar-request-detail request-${request.status.toLowerCase()}`}><p className="font-black">{requestInfo[request.status].short}｜{requestInfo[request.status].label}</p><p className="mt-1 text-sm">種類：{requestTypeLabels[request.requestType] ?? request.requestType}</p>{request.reason && <p className="mt-1 text-sm">理由：{request.reason}</p>}</div>)}
      </div>}
    </section>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="font-bold opacity-75">{label}</dt><dd className="mt-1 text-base font-black">{value}</dd></div>; }
function moveMonth(month: string, amount: number) { const [year, value] = month.split('-').map(Number); return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7); }
function calendarDays(month: string) { const [year, value] = month.split('-').map(Number); const first = new Date(Date.UTC(year, value - 1, 1)); const count = new Date(Date.UTC(year, value, 0)).getUTCDate(); return [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)] as Array<string | null>; }
function monthLabel(month: string) { const [year, value] = month.split('-'); return `${year}年${Number(value)}月`; }
function tokyoToday() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''; return `${get('year')}-${get('month')}-${get('day')}`; }
function formatDate(date: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(`${date}T00:00:00+09:00`)); }
function dayLabel(date: string, shiftType: ShiftType | undefined, requests: MyCalendar['requests']) { return [formatDate(date), shiftType ? shiftInfo[shiftType].label : '勤務なし', ...requests.map((row) => requestInfo[row.status].label)].join('、'); }
