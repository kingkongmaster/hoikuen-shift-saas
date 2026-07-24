import { useMemo, useState } from 'react';
import type { Session } from '../../api/client';
import { APP_BUILD, APP_VERSION } from '../../app-info';
import { EmptyState, MessageBanner } from '../../components/UiStates';
import { getDeviceInfo } from './device-info';

type FeedbackType = 'INQUIRY' | 'IMPROVEMENT' | 'BUG' | 'OPINION' | 'RATING';
type StoredFeedback = {
  id: string;
  type: FeedbackType;
  subject: string;
  category: string;
  content: string;
  occurredAt?: string;
  action?: string;
  expected?: string;
  actual?: string;
  rating?: number;
  screenName: string;
  appVersion: string;
  buildNumber: string;
  browser: string;
  operatingSystem: string;
  viewport: string;
  createdAt: string;
};
type Draft = {
  subject: string;
  category: string;
  content: string;
  occurredAt: string;
  action: string;
  expected: string;
  actual: string;
  rating: number;
};

const typeLabels: Record<FeedbackType, string> = { INQUIRY: 'お問い合わせ', IMPROVEMENT: '改善要望', BUG: '不具合報告', OPINION: 'ご意見', RATING: 'アプリ評価' };
const inquiryCategories = ['不具合', '改善要望', '操作方法', 'その他'];
const improvementCategories = ['UI', 'シフト', '通知', '希望休', '印刷', 'CSV', 'その他'];
const emptyDraft = (): Draft => ({ subject: '', category: '操作方法', content: '', occurredAt: localDateTime(), action: '', expected: '', actual: '', rating: 5 });

export function FeedbackManagement({ session }: { session: Session }) {
  const storageKey = `enshift.monitorFeedback.v1:${session.tenant.id}:${session.user.id}`;
  const [type, setType] = useState<FeedbackType>('INQUIRY');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [rows, setRows] = useState<StoredFeedback[]>(() => load(storageKey));
  const [message, setMessage] = useState('');
  const device = useMemo(() => getDeviceInfo(), []);
  const screenName = useMemo(() => document.querySelector('main h2')?.textContent?.trim() || 'ダッシュボード', []);
  const categories = type === 'IMPROVEMENT' ? improvementCategories : inquiryCategories;
  const changeType = (next: FeedbackType) => {
    setType(next);
    setDraft((current) => ({ ...emptyDraft(), rating: current.rating, category: next === 'IMPROVEMENT' ? 'UI' : '操作方法' }));
    setMessage('');
  };
  const valid = type === 'BUG'
    ? Boolean(draft.subject.trim() && draft.occurredAt && draft.action.trim() && draft.expected.trim() && draft.actual.trim())
    : type === 'RATING'
      ? Boolean(draft.rating && draft.content.trim())
      : Boolean(draft.subject.trim() && draft.content.trim());
  const submit = () => {
    if (!valid) return setMessage('必須項目を入力してください。');
    if (!window.confirm(`${typeLabels[type]}をこの端末へ保存します。よろしいですか？`)) return;
    const row: StoredFeedback = {
      id: crypto.randomUUID(),
      type,
      subject: draft.subject.trim() || `アプリ評価 ${draft.rating}点`,
      category: type === 'RATING' ? 'アプリ評価' : type === 'OPINION' ? 'その他' : draft.category,
      content: draft.content.trim(),
      ...(type === 'BUG' ? { occurredAt: new Date(draft.occurredAt).toISOString(), action: draft.action.trim(), expected: draft.expected.trim(), actual: draft.actual.trim() } : {}),
      ...(type === 'RATING' ? { rating: draft.rating } : {}),
      screenName,
      appVersion: APP_VERSION,
      buildNumber: APP_BUILD,
      browser: device.browser,
      operatingSystem: device.operatingSystem,
      viewport: device.viewport,
      createdAt: new Date().toISOString(),
    };
    const next = [row, ...rows];
    localStorage.setItem(storageKey, JSON.stringify(next));
    setRows(next);
    setDraft(emptyDraft());
    setMessage('報告をこの端末へ保存しました。管理者へ共有する場合はJSON書き出しをご利用ください。');
  };
  const remove = (id: string) => {
    if (!window.confirm('この保存済み報告を削除しますか？')) return;
    const next = rows.filter((row) => row.id !== id);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setRows(next);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ application: 'EnShift', exportedAt: new Date().toISOString(), tenantName: session.tenant.name, reports: rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `enshift-monitor-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <section className="mt-6 space-y-5">
    <div className="card">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="送信内容">
        {(Object.keys(typeLabels) as FeedbackType[]).map((key) => <button key={key} type="button" role="tab" aria-selected={type === key} onClick={() => changeType(key)} className={type === key ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>{typeLabels[key]}</button>)}
      </div>
      <div className="mt-6 grid gap-4">
        {type === 'RATING' ? <fieldset><legend className="text-sm font-semibold">評価 <Required /></legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setDraft({ ...draft, rating: value })} aria-label={`${value}点`} className={`min-h-11 min-w-11 rounded-lg border px-3 text-xl ${draft.rating >= value ? 'border-amber-400 bg-amber-50 text-amber-500' : 'border-slate-300 bg-white text-slate-300'}`}>★</button>)}</div></fieldset> : <>
          <Field label="件名" required><input className="input" maxLength={100} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field>
          {(type === 'INQUIRY' || type === 'IMPROVEMENT') && <Field label="カテゴリ" required><select className="input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>}
        </>}
        {type === 'BUG' && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="発生日時" required><input type="datetime-local" className="input" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></Field>
          <Field label="操作内容" required><textarea className="input min-h-28" maxLength={1000} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} /></Field>
          <Field label="期待した結果" required><textarea className="input min-h-28" maxLength={1000} value={draft.expected} onChange={(event) => setDraft({ ...draft, expected: event.target.value })} /></Field>
          <Field label="実際の結果" required><textarea className="input min-h-28" maxLength={1000} value={draft.actual} onChange={(event) => setDraft({ ...draft, actual: event.target.value })} /></Field>
        </div>}
        <Field label={type === 'RATING' ? '評価コメント' : type === 'OPINION' ? 'ご意見' : type === 'BUG' ? '補足内容' : '内容'} required={type !== 'BUG'}><textarea className="input min-h-36" maxLength={2000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></Field>
        <div className="rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600"><strong>自動付加情報</strong><br />画面：{screenName}／Version {APP_VERSION}／Build {APP_BUILD}<br />{device.browser}／{device.operatingSystem}／{device.viewport}</div>
        <p className="text-xs text-slate-500">パスワード、園児の氏名、健康情報などの秘密・個人情報は入力しないでください。内容はこの端末のブラウザ内だけに保存されます。</p>
        <button type="button" onClick={submit} disabled={!valid} className="btn-primary w-full sm:w-fit">確認して保存</button>
      </div>
    </div>
    {message && <MessageBanner kind={message.startsWith('必須') ? 'error' : 'success'}>{message}</MessageBanner>}
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">この端末に保存した報告</h3><p className="mt-1 text-sm text-slate-500">{rows.length}件</p></div><button type="button" onClick={exportJson} disabled={!rows.length} className="btn-secondary">JSON書き出し</button></div>
      {rows.length ? <ul className="mt-4 space-y-3">{rows.map((row) => <li key={row.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">{typeLabels[row.type]}</span><h4 className="mt-2 font-bold">{row.subject}</h4><p className="mt-1 text-sm text-slate-600">{row.content || row.actual}</p><p className="mt-2 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString('ja-JP')}／{row.browser}</p></div><button type="button" onClick={() => remove(row.id)} className="btn-secondary text-sm">削除</button></div></li>)}</ul> : <div className="mt-4"><EmptyState title="保存済みの報告はありません" description="お問い合わせや改善要望を保存すると、ここで確認できます。" /></div>}
    </div>
  </section>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}{required && <Required />}{children}</label>;
}
function Required() { return <span className="ml-1 text-xs font-bold text-rose-700">必須</span>; }
function localDateTime() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}
function load(key: string): StoredFeedback[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
