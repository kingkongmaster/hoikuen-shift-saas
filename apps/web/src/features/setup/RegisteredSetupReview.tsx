import { useEffect, useState } from 'react';
import { api, type Session, type SetupState } from '../../api/client';
import { hasExistingWorkforceSetup, isSetupComplete } from './setup-wizard-state.js';
import { WorkforceReviewStep } from './WorkforceReviewStep';

export function RegisteredSetupReview({ session, onBack }: { session: Session; onBack: () => void }) {
  if (session.role !== 'ADMIN') return <p role="alert">管理者のみ確認できます。</p>;
  return <AdminReview key={session.accessToken} token={session.accessToken} onBack={onBack} />;
}

function AdminReview({ token, onBack }: { token: string; onBack: () => void }) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSetup(null);
    setError('');
    api.setup(token).then(value => { if (active) setSetup(value); })
      .catch(() => { if (active) setError('登録内容を取得できませんでした。'); });
    return () => { active = false; };
  }, [token, attempt]);
  return <section aria-label="登録内容の確認" className="space-y-6">
    <button type="button" className="btn-secondary" onClick={onBack}>園設定へ戻る</button>
    <p>確認専用です。設定や初期設定の完了状態、利用規約への同意は変更しません。</p>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="btn-secondary mt-3" onClick={() => setAttempt(value => value + 1)}>再読込</button></div>
      : !setup ? <p role="status">登録内容を読み込んでいます…</p>
      : !isSetupComplete(setup) || !hasExistingWorkforceSetup(setup) ? <p role="status">初期設定または登録内容の確認が完了していません。ここでは設定を変更できません。</p>
      : <><WorkforceReviewStep setup={setup} step={2} /><WorkforceReviewStep setup={setup} step={3} /></>}
  </section>;
}
