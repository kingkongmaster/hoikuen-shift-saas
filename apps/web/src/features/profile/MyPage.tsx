import { useEffect, useState } from 'react';
import { api, type MyCalendar } from '../../api/client';
import { SkeletonState } from '../../components/UiStates';

const employmentLabels = { FULL_TIME: '正職員', PART_TIME: 'パート', REEMPLOYED: '再雇用' } as const;
const classLabels: Record<string, string> = { AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' };

export function MyPage({ token }: { token: string }) {
  const [staff, setStaff] = useState<MyCalendar['staff'] | null>(null);
  const [loading, setLoading] = useState(true);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const month = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
  useEffect(() => { let active = true; api.myCalendar(token, month).then((result) => { if (active) setStaff(result.staff); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [month, token]);
  if (loading) return <SkeletonState cards={2} label="プロフィールを読み込んでいます…" />;
  if (!staff) return <p role="alert" className="card font-bold text-rose-800">プロフィールを表示できませんでした。</p>;
  return <section className="card max-w-2xl" aria-labelledby="my-profile-title">
    <p className="eyebrow">MY PROFILE</p><h2 id="my-profile-title" className="mt-1 text-2xl font-black">{staff.displayName}</h2>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2">
      <Item label="職員番号" value={staff.employeeNumber} /><Item label="役職" value={staff.jobTitle ?? '未設定'} /><Item label="雇用区分" value={employmentLabels[staff.employmentType]} /><Item label="担当" value={classLabels[staff.assignedClass] ?? staff.assignedClass} /><Item label="メール" value={staff.email ?? '未設定'} />
    </dl>
    <p className="mt-6 rounded-xl bg-[var(--canvas)] p-4 text-sm leading-6 text-[var(--ink-muted)]">勤務条件、雇用契約、管理者用備考などの非公開情報はマイページには表示されません。</p>
  </section>;
}
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm font-bold text-[var(--ink-muted)]">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>; }
