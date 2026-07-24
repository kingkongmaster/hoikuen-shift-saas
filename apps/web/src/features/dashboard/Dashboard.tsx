import { useEffect, useState } from 'react';
import { api, type Notification, type Session } from '../../api/client';
import { AuditLogManagement } from '../audit/AuditLogManagement';
import { DataExportManagement } from '../exports/DataExportManagement';
import { NotificationManagement } from '../notifications/NotificationManagement';
import { RequestManagement } from '../requests/RequestManagement';
import { ShiftSettings } from '../settings/ShiftSettings';
import { ShiftSwapManagement } from '../shift-swaps/ShiftSwapManagement';
import { ShiftManagement } from '../shifts/ShiftManagement';
import { StaffManagement } from '../staff/StaffManagement';
import { SubscriptionInfo } from '../subscription/SubscriptionInfo';
import { FeedbackManagement } from '../support/FeedbackManagement';
import { UpdateHistory } from '../support/UpdateHistory';
import { HomeDashboard } from './HomeDashboard';

type View = 'home' | 'staff' | 'requests' | 'shifts' | 'settings' | 'notifications' | 'swaps' | 'audit' | 'exports' | 'subscription' | 'feedback' | 'updates';
const roleLabels = { ADMIN: '管理者', DIRECTOR: '園長', CHIEF: '主任', STAFF: '一般職員' } as const;
const viewInfo: Record<View, { title: string; description: string }> = {
  home: { title: 'ホーム', description: '今日の勤務と大切なお知らせを確認できます。' },
  staff: { title: '職員マスター管理', description: '園ごとの職員情報を登録・編集・無効化できます。' },
  requests: { title: '希望休管理', description: '希望休の申請と確認を行います。' },
  shifts: { title: '月間シフト管理', description: '月間勤務表を確認・管理します。' },
  settings: { title: '園設定', description: '必要人数、勤務ルール、クラス配置、休園日を管理します。' },
  notifications: { title: '通知', description: '自分宛のお知らせを確認します。' },
  swaps: { title: 'シフト交換', description: '確定済みシフトの交換を申請・管理します。' },
  audit: { title: '監査ログ', description: '園内の操作履歴を確認します。' },
  exports: { title: 'データ出力', description: 'CSV、印刷、バックアップを利用します。' },
  subscription: { title: '契約情報', description: '契約プランと利用状態を確認します。' },
  feedback: { title: 'お問い合わせ', description: '不具合・改善要望・ご意見・アプリ評価をこの端末へ保存します。' },
  updates: { title: '更新履歴', description: 'EnShiftの機能追加と改善内容を確認します。' },
};
const everydayMenu: Array<{ view: View; symbol: string; label: string; description: string }> = [
  { view: 'requests', symbol: '休', label: '希望休', description: '休みを申請・確認' },
  { view: 'shifts', symbol: '勤', label: 'シフト', description: '勤務予定を確認' },
  { view: 'notifications', symbol: '知', label: '通知', description: '大切なお知らせ' },
  { view: 'swaps', symbol: '交', label: 'シフト交換', description: '勤務の交換を申請' },
];

export function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.role === 'ADMIN';
  const canManageShifts = session.role === 'ADMIN' || session.role === 'DIRECTOR';
  const [view, setView] = useState<View>('home');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unread = notifications.filter((row) => !row.isRead).length;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    let active = true;
    api.notifications(session.accessToken).then((rows) => { if (active) setNotifications(rows); }).catch(() => undefined);
    return () => { active = false; };
  }, [session.accessToken]);
  const info = viewInfo[view];
  const selectView = (next: View) => {
    window.dispatchEvent(new CustomEvent('enshift:view-change', { detail: { from: view, to: next } }));
    setView(next);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const refreshUnread = (count: number) => setNotifications((rows) => {
    if (count === 0) return rows.map((row) => ({ ...row, isRead: true }));
    void api.notifications(session.accessToken).then(setNotifications).catch(() => undefined);
    return rows;
  });
  return <main className="min-h-screen bg-[var(--canvas)] pb-24 text-[var(--ink)] md:pb-0">
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <button type="button" onClick={() => selectView('home')} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl text-left">
          <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl" />
          <span className="min-w-0"><span className="block text-sm font-black tracking-wide text-[var(--brand)]">EnShift</span><span className="block truncate text-sm font-bold sm:text-base">{session.tenant.name}</span></span>
        </button>
        <div className="flex items-center gap-2"><div className="hidden text-right sm:block"><p className="text-sm font-bold">{session.user.displayName}</p><p className="text-xs text-[var(--ink-muted)]">{roleLabels[session.role]}</p></div><button onClick={onLogout} className="btn-quiet text-sm">ログアウト</button></div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      {view === 'home' ? <>
        <header className="mb-6"><p className="eyebrow">{greeting()}</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{session.user.displayName}さん</h1><p className="mt-2 text-sm font-medium text-[var(--ink-muted)]">{longDate()}の予定です</p></header>
        <HomeDashboard session={session} notifications={notifications} onOpen={selectView} />
        <section className="mt-7" aria-labelledby="menu-heading">
          <div className="mb-4"><p className="eyebrow">MENU</p><h2 id="menu-heading" className="mt-1 text-xl font-black">よく使うメニュー</h2></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{everydayMenu.map((item) => <MenuTile key={item.view} {...item} badge={item.view === 'notifications' ? unread : 0} onClick={() => selectView(item.view)} />)}</div>
          <details className="other-menu mt-4"><summary><span className="action-symbol action-symbol-soft" aria-hidden="true">他</span><span><strong>その他のメニュー</strong><small>管理・設定・サポート</small></span></summary><div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-3">
            {isAdmin && <OtherButton symbol="職" label="職員マスター" onClick={() => selectView('staff')} />}
            {canManageShifts && <OtherButton symbol="園" label="園設定" onClick={() => selectView('settings')} />}
            {canManageShifts && <OtherButton symbol="契" label="契約情報" onClick={() => selectView('subscription')} />}
            {canManageShifts && <OtherButton symbol="録" label="監査ログ" onClick={() => selectView('audit')} />}
            {canManageShifts && <OtherButton symbol="出" label="データ出力" onClick={() => selectView('exports')} />}
            <OtherButton symbol="問" label="お問い合わせ" onClick={() => selectView('feedback')} />
            <OtherButton symbol="新" label="更新履歴" onClick={() => selectView('updates')} />
          </div></details>
        </section>
      </> : <>
        <header className="page-heading"><button type="button" onClick={() => selectView('home')} className="btn-quiet mb-4"><span aria-hidden="true">←</span>ホームへ戻る</button><p className="eyebrow">ENSHIFT</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{info.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">{view === 'shifts' && !canManageShifts ? '確定済みの自分の勤務シフトを確認できます。' : info.description}</p></header>
        <ViewContent view={view} session={session} isAdmin={isAdmin} canManageShifts={canManageShifts} onUnreadChange={refreshUnread} />
      </>}
    </div>

    <nav className="bottom-nav md:hidden" aria-label="主要メニュー">
      <BottomButton symbol="今" label="ホーム" active={view === 'home'} onClick={() => selectView('home')} />
      <BottomButton symbol="休" label="希望休" active={view === 'requests'} onClick={() => selectView('requests')} />
      <BottomButton symbol="勤" label="シフト" active={view === 'shifts'} onClick={() => selectView('shifts')} />
      <BottomButton symbol="知" label="通知" badge={unread} active={view === 'notifications'} onClick={() => selectView('notifications')} />
    </nav>
  </main>;
}

function ViewContent({ view, session, isAdmin, canManageShifts, onUnreadChange }: { view: View; session: Session; isAdmin: boolean; canManageShifts: boolean; onUnreadChange: (count: number) => void }) {
  return view === 'staff' && isAdmin ? <StaffManagement token={session.accessToken} />
    : view === 'requests' ? <RequestManagement session={session} />
      : view === 'settings' && canManageShifts ? <ShiftSettings session={session} />
        : view === 'subscription' && canManageShifts ? <SubscriptionInfo session={session} />
          : view === 'notifications' ? <NotificationManagement session={session} onUnreadChange={onUnreadChange} />
            : view === 'swaps' ? <ShiftSwapManagement session={session} />
              : view === 'audit' && canManageShifts ? <AuditLogManagement session={session} />
                : view === 'exports' && canManageShifts ? <DataExportManagement session={session} />
                  : view === 'feedback' ? <FeedbackManagement session={session} />
                    : view === 'updates' ? <div className="mt-6"><UpdateHistory /></div>
                      : <ShiftManagement session={session} />;
}
function MenuTile({ symbol, label, description, badge, onClick }: { symbol: string; label: string; description: string; badge?: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="menu-tile basis-[calc(50%-0.25rem)]"><span className="action-symbol" aria-hidden="true">{symbol}</span><span className="min-w-0 text-left"><strong className="block">{label}</strong><small className="mt-1 block text-xs text-[var(--ink-muted)]">{description}</small></span>{badge ? <span className="menu-badge" aria-label={`未読${badge}件`}>{badge}</span> : null}</button>;
}
function OtherButton({ symbol, label, onClick }: { symbol: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="other-menu-button"><span className="action-symbol action-symbol-soft" aria-hidden="true">{symbol}</span><span>{label}</span><span className="ml-auto text-[var(--ink-muted)]" aria-hidden="true">→</span></button>;
}
function BottomButton({ symbol, label, badge, active, onClick }: { symbol: string; label: string; badge?: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={active ? 'bottom-nav-button is-active' : 'bottom-nav-button'}><span className="relative"><span className="bottom-symbol" aria-hidden="true">{symbol}</span>{badge ? <span className="bottom-badge" aria-label={`未読${badge}件`}>{badge}</span> : null}</span><span>{label}</span></button>;
}
function greeting() {
  const hour = Number(new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' }).format(new Date()));
  return hour < 11 ? 'おはようございます' : hour < 17 ? 'こんにちは' : 'おつかれさまです';
}
function longDate() {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' }).format(new Date());
}
