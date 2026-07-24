import { useEffect, useState } from 'react';
import { api, type Session, type SubscriptionInfo as SubscriptionInfoType } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/UiStates';

const planLabels = { TRIAL: 'トライアル', STANDARD: 'スタンダード', PROFESSIONAL: 'プロフェッショナル' } as const;
const statusLabels = { TRIAL: '試用中', ACTIVE: '契約中', PAST_DUE: '支払確認中', SUSPENDED: '利用停止', CANCELLED: '解約済み', EXPIRED: '期限切れ' } as const;
function date(value: string | null) { return value ? new Intl.DateTimeFormat('ja-JP').format(new Date(value)) : '—'; }

export function SubscriptionInfo({ session }: { session: Session }) {
  const [subscription, setSubscription] = useState<SubscriptionInfoType | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    api.subscription(session.accessToken).then((next) => { if (active) setSubscription(next); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '契約情報を取得できませんでした。'); });
    return () => { active = false; };
  }, [attempt, session.accessToken]);
  if (error) return <section className="mt-6"><ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} /></section>;
  if (!subscription) return <section className="mt-6"><LoadingState label="契約情報を読み込んでいます…" /></section>;
  return <section className="mt-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card label="契約プラン" value={planLabels[subscription.plan]} />
      <Card label="契約状態" value={statusLabels[subscription.status]} accent />
      <Card label="Trial終了日" value={date(subscription.trialEndsAt)} />
      <Card label="契約開始日" value={date(subscription.currentPeriodStartedAt ?? subscription.trialStartedAt)} />
      <Card label="職員上限" value={`${subscription.staffLimit}名`} />
      <Card label="現在登録人数" value={`${subscription.activeStaffCount}名`} detail={`残り ${subscription.remainingStaffSlots}名`} />
    </div>
    <article className="mt-5 rounded-xl border bg-white p-5 shadow-sm"><h3 className="font-bold">利用可能な機能</h3><ul className="mt-3 flex flex-wrap gap-2">{subscription.features.map((feature) => <li key={feature} className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">{feature}</li>)}</ul>{subscription.readOnly && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">現在の契約状態では閲覧のみ利用できます。</p>}</article>
  </section>;
}
function Card({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent?: boolean }) { return <article className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-xl font-bold ${accent ? 'text-emerald-700' : ''}`}>{value}</p>{detail && <p className="mt-2 text-sm text-slate-500">{detail}</p>}</article>; }
