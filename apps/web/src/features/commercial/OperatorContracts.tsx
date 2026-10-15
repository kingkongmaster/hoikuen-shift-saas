import { useState, type FormEvent } from 'react';
import { request, type Session } from '../../api/client';
import { contractStateLabels } from '../subscription/ContractGate';
export type ContractTenant={id:string;name:string;effectiveState:string;subscription:{plan:string;status:string;trialEndsAt:string|null;currentPeriodStartedAt:string|null;currentPeriodEndsAt:string|null;cancelledAt:string|null;staffLimit:number}|null};
export function OperatorContracts({session,tenants,reload}:{session:Session;tenants:ContractTenant[];reload:()=>Promise<void>}){
 const [selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const tenant=tenants.find(t=>t.id===selected),sub=tenant?.subscription;
 async function update(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget),action=String(f.get('action')),reason=String(f.get('reason'));let input:Record<string,unknown>={reason};
  if(action==='activate')input={...input,plan:f.get('plan'),status:'ACTIVE',currentPeriodStartedAt:new Date(String(f.get('start'))).toISOString(),currentPeriodEndsAt:new Date(String(f.get('end'))).toISOString(),confirmationReference:f.get('reference'),cancelAtPeriodEnd:false};
  if(action==='suspend')input.status='SUSPENDED';
  if(action==='cancel')input.cancelAtPeriodEnd=true;
  if(action==='withdraw')input.cancelAtPeriodEnd=false;
  if(action==='trial')input={...input,extendTrialDays:30,cancelAtPeriodEnd:false};
  try{await request(`/platform/tenants/${selected}/subscription`,{method:'PATCH',body:JSON.stringify(input)},session.accessToken);await reload();setMessage('契約を更新しました。');}catch(e){setMessage(e instanceof Error?e.message:'更新できませんでした。');}finally{setBusy(false);}
 }
 const [action,setAction]=useState('activate');
 const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('ja-JP'):'未設定';
 return <section className="card my-5"><h2 className="text-xl font-bold">契約・利用状態の管理</h2><p className="my-3">申込・契約の確認後に更新してください。この操作で決済は行いません。解約・停止によるデータ削除はありません。</p><label>契約を確認する園<select className="input" value={selected} onChange={e=>{setSelected(e.target.value);setMessage('');}}><option value="">選択してください</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{tenant&&<><dl className="my-4 grid gap-2"><div>プラン：{sub?.plan??'未確認'}</div><div>状態：{contractStateLabels[tenant.effectiveState]??'確認が必要'}</div><div>試用終了：{date(sub?.trialEndsAt)}</div><div>契約開始：{date(sub?.currentPeriodStartedAt)}</div><div>契約終了：{date(sub?.currentPeriodEndsAt)}</div><div>解約日：{date(sub?.cancelledAt)}</div><div>職員上限：{sub?.staffLimit??'未確認'}</div></dl><form className="grid gap-3" onSubmit={update}><label>契約の操作<select name="action" className="input" value={action} onChange={e=>setAction(e.target.value)}><option value="activate">有料契約の開始・更新・プラン変更・再開</option><option value="suspend">利用停止</option><option value="cancel">期間終了時に解約</option><option value="withdraw">解約予定を取り消す</option>{sub?.plan==='TRIAL'&&<option value="trial">試用を30日延長・再開</option>}</select></label>{action==='activate'&&<><label>変更先プラン<select className="input" name="plan" defaultValue={sub?.plan==='PROFESSIONAL'?'PROFESSIONAL':'STANDARD'}><option>STANDARD</option><option>PROFESSIONAL</option></select></label><label>契約開始日時<input className="input" name="start" type="datetime-local" required/></label><label>契約終了日時<input className="input" name="end" type="datetime-local" required/></label><label>確認済み契約の参照番号<input className="input" name="reference" maxLength={500} required/></label></>}<label>変更理由<input className="input" name="reason" required maxLength={500}/></label><button disabled={busy} className="btn-primary">契約変更を保存</button></form></>}<p role="status" className="my-3">{message}</p></section>;
}
