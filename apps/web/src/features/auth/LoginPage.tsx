import { FormEvent, useState } from 'react';
import { api, type Session } from '../../api/client';

export function LoginPage({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'owner@demo.enshift.local' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'ChangeMe123!' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(nextEmail: string, nextPassword: string) {
    setLoading(true); setError('');
    try { onSuccess(await api.login(nextEmail, nextPassword)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ログインできませんでした。メールアドレスとパスワードをご確認ください。'); }
    finally { setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void login(email, password); }

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_#e7f1ec,_#f6f7f2_48%)] p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-emerald-950/10 sm:p-8">
      <div className="flex items-center gap-3"><img src="/icons/icon-192.png" alt="" className="size-12 rounded-xl" /><div><p className="font-black tracking-wide text-[var(--brand)]">AeN Shift</p><h1 className="text-2xl font-black sm:text-3xl">AeN Shiftにログイン</h1></div></div>
      <p className="mt-3 text-sm font-semibold leading-6 text-[var(--ink-muted)]">保育園・幼稚園・認定こども園向けシフト管理システム</p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">先生にゆとりを、園に安心を。</p>
      <label className="mt-7 block text-sm font-bold">メールアドレス<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required className="input mt-2" /></label>
      <label className="mt-4 block text-sm font-bold">パスワード<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" minLength={8} required className="input mt-2" /></label>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <button disabled={loading} className="btn-primary mt-6 w-full py-3">{loading ? 'ログイン中…' : 'ログイン'}</button>
      {import.meta.env.DEV && <div data-testid="development-demo-login">
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />プレゼン・モニター園向け<span className="h-px flex-1 bg-slate-200" /></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={loading} onClick={() => void login('owner@demo.enshift.local', 'ChangeMe123!')} className="btn-secondary w-full py-3">デモデータで開始（管理者）</button><button type="button" disabled={loading} onClick={() => void login('staff@demo.enshift.local', 'ChangeMe123!')} className="btn-secondary w-full py-3">一般職員デモ</button></div>
        <p className="mt-4 text-xs leading-5 text-slate-500">開発環境だけに表示されます。一般職員デモでは本人の勤務・希望休・通知・交換申請を確認できます。</p>
      </div>}
    </form>
  </main>;
}
