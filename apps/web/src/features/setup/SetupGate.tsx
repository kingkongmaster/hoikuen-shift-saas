import { useEffect, useState } from 'react';
import { api, type Session, type SetupState } from '../../api/client';
import { Dashboard } from '../dashboard/Dashboard';
import { FirstLoginExperience } from '../onboarding/FirstLoginExperience';
import { SetupWizard } from './SetupWizard';
import { canUseSetupWizard, isSetupComplete } from './setup-wizard-state.js';

export function SetupGate({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(() => canUseSetupWizard(session.role));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!canUseSetupWizard(session.role)) return;
    let active = true;
    setLoading(true);
    setError('');
    api.setup(session.accessToken)
      .then((next) => { if (active) setSetup(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '初期設定を確認できませんでした。時間をおいてもう一度お試しください。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session.accessToken, session.role]);

  if (!canUseSetupWizard(session.role)) return <ReadyDashboard session={session} onLogout={onLogout} />;
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><div role="status" className="text-center"><span className="mx-auto block size-9 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-700" /><p className="mt-4 font-semibold">初期設定を確認しています…</p></div></main>;
  if (error || !setup) return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5"><section className="card w-full max-w-md text-center"><span className="empty-symbol mx-auto" aria-hidden="true">再</span><h1 className="mt-4 text-xl font-bold">初期設定を確認できませんでした</h1><p role="alert" className="mt-4 text-sm leading-6 text-rose-700">{error || '通信状態をご確認ください。'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onLogout} className="btn-secondary">ログアウト</button><button type="button" onClick={() => setAttempt((value) => value + 1)} className="btn-primary">もう一度試す</button></div></section></main>;
  if (isSetupComplete(setup)) return <ReadyDashboard session={session} onLogout={onLogout} />;
  return <SetupWizard session={session} initialSetup={setup} onComplete={setSetup} onLogout={onLogout} />;
}

function ReadyDashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return <FirstLoginExperience session={session}><Dashboard session={session} onLogout={onLogout} /></FirstLoginExperience>;
}
