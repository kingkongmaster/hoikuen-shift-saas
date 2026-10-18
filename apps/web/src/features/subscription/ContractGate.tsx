import { FeedbackManagement } from '../support/FeedbackManagement';
import { useEffect, useState, Fragment, type ReactNode } from 'react';
import { request, type Session } from '../../api/client';
export const contractStateLabels:Record<string,string>={TRIAL:'試用中',ACTIVE:'契約中',CANCELLATION_SCHEDULED:'解約予定',PAST_DUE:'支払確認中',SUSPENDED:'利用停止',CANCELLED:'解約済み',EXPIRED:'期限切れ',UNVERIFIED:'契約情報の確認が必要です'};
export function ContractGate({session,onLogout,children}:{session:Session;onLogout:()=>void;children:ReactNode}){
 const [access,setAccess]=useState<{state:string;readOnly:boolean;plan?:string;updatedAt?:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;const refresh=()=>request<{state:string;readOnly:boolean;plan?:string;updatedAt?:string}>('/subscription/access',{},session.accessToken).then(r=>{if(active){setAccess(r);setError('');}}).catch(()=>{if(active){setAccess(null);setError('契約情報を取得できません。時間をおいて再度お試しください。');}});void refresh();const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('enshift:contract-changed',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('enshift:contract-changed',refresh);};},[session.accessToken]);
 if(access&&!access.readOnly)return <Fragment key={[access.plan,access.updatedAt,access.state].join(':')}>{children}</Fragment>;
 return <main className="mx-auto w-full max-w-2xl p-5"><h1 className="text-2xl font-bold">契約のご案内</h1><p role="status" className="my-5">{error||(!access?'契約状態を確認しています…':contractStateLabels[access.state]??contractStateLabels.UNVERIFIED)}</p>{access&&<p className="mb-5">現在は業務機能をご利用いただけません。保存済みデータは自動削除されません。再開・データの確認については運営窓口へお問い合わせください。</p>}<button className="btn-secondary" onClick={onLogout}>ログアウト</button><a className="btn-secondary ml-3" href="#support">サポート情報</a>{access&&<FeedbackManagement session={session}/>}</main>;
}
