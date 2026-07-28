import { FormEvent, useMemo, useRef, useState } from 'react';
import { api, type Session } from '../../api/client';

export function InitialPasswordChangePage({ session, onCompleted }: { session: Session; onCompleted: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentVisible, setCurrentVisible] = useState(false);
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const policyValid = useMemo(() => newPassword.length >= 12 && newPassword.length <= 128 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword) && newPassword === newPassword.trim(), [newPassword]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (newPassword !== confirmPassword) { setError('新しいパスワードと確認用パスワードが一致しません。'); return; }
    if (!policyValid) { setError('表示されているパスワード条件をすべて満たしてください。'); return; }
    submitting.current = true; setLoading(true); setError('');
    try {
      await api.changeInitialPassword(session.accessToken, { currentPassword, newPassword, confirmPassword });
      sessionStorage.removeItem('enshift.accessToken');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setCompleted(true);
    } catch (reason) { setCurrentPassword(''); setError(reason instanceof Error ? reason.message : 'パスワードを変更できませんでした。'); }
    finally { submitting.current = false; setLoading(false); }
  }

  if (completed) return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5"><section className="card w-full max-w-md text-center"><span className="empty-symbol mx-auto" aria-hidden="true">完</span><h1 className="mt-4 text-2xl font-black">パスワードを変更しました</h1><p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">安全のため、本人用の新しいパスワードでもう一度ログインしてください。</p><button type="button" className="btn-primary mt-6 w-full" onClick={onCompleted}>ログイン画面へ</button></section></main>;

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_#e7f1ec,_#f6f7f2_48%)] p-4 sm:p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl shadow-emerald-950/10 sm:p-8">
      <p className="eyebrow">初回ログイン</p><h1 className="mt-1 text-2xl font-black">本人用パスワードへ変更</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">仮パスワードのままではEnShiftの機能を利用できません。ご本人だけが知っているパスワードへ変更してください。</p>
      <PasswordField label="現在の仮パスワード" value={currentPassword} onChange={setCurrentPassword} visible={currentVisible} onVisibilityChange={setCurrentVisible} autoComplete="current-password" />
      <PasswordField label="新しいパスワード" value={newPassword} onChange={setNewPassword} visible={newVisible} onVisibilityChange={setNewVisible} autoComplete="new-password" isNew />
      <PasswordField label="新しいパスワード（確認）" value={confirmPassword} onChange={setConfirmPassword} visible={confirmVisible} onVisibilityChange={setConfirmVisible} autoComplete="new-password" isNew />
      <div className="mt-3 rounded-xl bg-[var(--brand-soft)] p-3 text-xs leading-5 text-[var(--brand-deep)]"><strong>パスワード条件</strong><ul className="mt-1 list-disc pl-5"><li>12～128文字</li><li>英大文字・英小文字・数字・記号を各1文字以上</li><li>先頭・末尾に空白を使用しない</li><li>現在のパスワード、メールアドレス、表示名と同じ値は不可</li></ul></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <button disabled={loading} className="btn-primary mt-5 w-full">{loading ? '変更しています…' : 'パスワードを変更'}</button>
    </form>
  </main>;
}

function PasswordField({ label, value, onChange, visible, onVisibilityChange, autoComplete, isNew = false }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onVisibilityChange: (value: boolean) => void; autoComplete: 'current-password' | 'new-password'; isNew?: boolean }) {
  return <div className="mt-4"><label className="block text-sm font-bold">{label}<input value={value} onChange={(event) => onChange(event.target.value)} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={isNew ? 12 : undefined} maxLength={128} required className="input mt-2" /></label><label className="mt-1 flex min-h-10 items-center gap-2 text-xs font-bold text-[var(--ink-muted)]"><input type="checkbox" checked={visible} onChange={(event) => onVisibilityChange(event.target.checked)} className="size-4" />{label}を表示</label></div>;
}
