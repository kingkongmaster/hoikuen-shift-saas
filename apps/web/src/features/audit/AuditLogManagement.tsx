import { useEffect, useState } from 'react';
import { api, type AuditLog, type Session } from '../../api/client';

export function AuditLogManagement({ session }: { session: Session }) {
  const [rows, setRows] = useState<AuditLog[]>([]); const [query, setQuery] = useState({ from: '', to: '', memberId: '', action: '' }); const [message, setMessage] = useState('');
  const load = async () => { try { setRows(await api.auditLogs(session.accessToken, query)); } catch (error) { setMessage(error instanceof Error ? error.message : '操作履歴を確認できませんでした。時間をおいてもう一度お試しください。'); } };
  useEffect(() => { void load(); }, []);
  return <section className="mt-6"><h3 className="text-xl font-bold">監査ログ</h3><div className="mt-4 flex flex-wrap gap-2 rounded-xl border bg-white p-4">
    <input aria-label="開始日" type="date" value={query.from} onChange={(event) => setQuery({ ...query, from: event.target.value })} className="rounded border p-2" />
    <input aria-label="終了日" type="date" value={query.to} onChange={(event) => setQuery({ ...query, to: event.target.value })} className="rounded border p-2" />
    <input aria-label="職員ID" placeholder="職員ID" value={query.memberId} onChange={(event) => setQuery({ ...query, memberId: event.target.value })} className="rounded border p-2" />
    <input aria-label="操作種類" placeholder="操作種類" value={query.action} onChange={(event) => setQuery({ ...query, action: event.target.value })} className="rounded border p-2" />
    <button type="button" onClick={load} className="rounded bg-slate-800 px-4 py-2 text-white">検索</button></div>
    {message && <p role="status" className="mt-3 rounded bg-slate-100 p-3">{message}</p>}<div className="mt-4 overflow-x-auto rounded-xl border bg-white"><table className="min-w-full text-sm"><thead><tr className="bg-slate-100"><th>日時</th><th>職員</th><th>操作</th><th>対象</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{new Date(row.createdAt).toLocaleString('ja-JP')}</td><td className="p-3">{row.member.displayName}</td><td className="p-3">{row.action}</td><td className="p-3">{row.targetType}</td></tr>)}</tbody></table>{!rows.length && <p className="p-4 text-slate-500">監査ログはありません。</p>}</div></section>;
}
