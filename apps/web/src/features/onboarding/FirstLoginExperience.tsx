import { useState, type ReactNode } from 'react';
import type { Session } from '../../api/client';

const lessons = [
  {
    symbol: '今',
    title: '今日の勤務',
    description: 'ホームを開くと、今日の出勤・退勤時刻と勤務区分を最初に確認できます。',
  },
  {
    symbol: '休',
    title: '希望休',
    description: '画面下の「希望休」から申請できます。申請後の状態も同じ画面で確認できます。',
  },
  {
    symbol: '知',
    title: '通知',
    description: 'シフトや申請に動きがあると通知でお知らせします。未読件数もホームに表示されます。',
  },
] as const;

type Stage = 'welcome' | 'tutorial' | 'complete';

export function FirstLoginExperience({ session, children }: { session: Session; children: ReactNode }) {
  const storageKey = `enshift.onboarding.completed:${session.tenant.id}:${session.user.id}`;
  const [stage, setStage] = useState<Stage>(() => hasCompleted(storageKey) ? 'complete' : 'welcome');
  const [lesson, setLesson] = useState(0);

  const complete = () => {
    try { window.localStorage.setItem(storageKey, new Date().toISOString()); } catch { /* 端末保存が使えなくても利用は継続する */ }
    setStage('complete');
  };

  if (stage === 'complete') return children;
  if (stage === 'welcome') {
    return <section className="onboarding-screen" aria-labelledby="welcome-title">
      <div className="onboarding-card text-center">
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[1.4rem] shadow-md" />
        <p className="eyebrow mt-7">WELCOME TO ENSHIFT</p>
        <h1 id="welcome-title" className="mt-3 text-3xl font-black leading-tight">ようこそ<br /><span className="text-[var(--brand)]">{session.tenant.name}へ</span></h1>
        <p className="mx-auto mt-6 max-w-sm text-base leading-8 text-[var(--ink-muted)]">EnShiftへようこそ。<br />毎日の勤務を、分かりやすく確認できるアプリです。</p>
        <button type="button" onClick={() => setStage('tutorial')} className="btn-primary mt-8 w-full">はじめる</button>
      </div>
    </section>;
  }

  const item = lessons[lesson];
  const last = lesson === lessons.length - 1;
  return <section className="onboarding-screen" aria-labelledby="tutorial-title">
    <div className="onboarding-card">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">かんたんガイド</p>
        <span className="count-label">{lesson + 1} / {lessons.length}</span>
      </div>
      <div className="mt-8 text-center">
        <span className="onboarding-symbol" aria-hidden="true">{item.symbol}</span>
        <h1 id="tutorial-title" className="mt-6 text-2xl font-black">{item.title}</h1>
        <p className="mt-4 text-base leading-8 text-[var(--ink-muted)]">{item.description}</p>
      </div>
      <div className="mt-9 flex gap-2" aria-hidden="true">
        {lessons.map((entry, index) => <span key={entry.title} className={index === lesson ? 'tutorial-dot is-active' : 'tutorial-dot'} />)}
      </div>
      <div className="mt-8 grid gap-3">
        <button type="button" onClick={() => last ? complete() : setLesson((value) => value + 1)} className="btn-primary w-full">{last ? 'ホームを見る' : '次へ'}</button>
        <button type="button" onClick={complete} className="btn-quiet w-full">ガイドをスキップ</button>
      </div>
    </div>
  </section>;
}

function hasCompleted(key: string) {
  try { return Boolean(window.localStorage.getItem(key)); } catch { return false; }
}
