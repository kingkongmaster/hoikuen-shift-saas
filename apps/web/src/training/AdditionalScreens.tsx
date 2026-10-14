import {useEffect,useState} from 'react';
import {LoginPage} from '../features/auth/LoginPage';
import {FirstLoginExperience} from '../features/onboarding/FirstLoginExperience';
import {HomeDashboard} from '../features/dashboard/HomeDashboard';
import {WorkforceReviewStep} from '../features/setup/WorkforceReviewStep';
import {ShiftManagement} from '../features/shifts/ShiftManagement';
import {RequestManagement} from '../features/requests/RequestManagement';
import {TenantCalendarManagement} from '../features/calendar/TenantCalendarManagement';
import {StaffingRequirementManagement} from '../features/settings/StaffingRequirementManagement';
import {ShiftSettings} from '../features/settings/ShiftSettings';
import {PersonalCalendar} from '../features/calendar/PersonalCalendar';
import {ShiftSwapManagement} from '../features/shift-swaps/ShiftSwapManagement';
import {api,month,trainingRole,prepareSwapExercise,practiceAction,practiceState,reviewFixture,sessionFor} from './mock-client';
import type {Step} from './courses';
const signal=(name:string)=>window.dispatchEvent(new CustomEvent('training:action',{detail:{name,ok:true}}));
export function AdditionalScreen({step,onAdvance}:{step:Step;onAdvance:()=>void}){
 const [stage,setStage]=useState(0);const [message,setMessage]=useState('');const [selected,setSelected]=useState('');const [view,setView]=useState('');
 const session=sessionFor('ADMIN');const token=session.accessToken;
 const home=<HomeDashboard session={session} notifications={[]} onOpen={setView}/>;
 const success=()=>{if(step.screen==='login'){onAdvance();return;}setStage(2);signal('login-complete');};
 if(step.screen==='access')return <section className="card"><h2 className="text-xl font-bold">園から案内された正式URLへ</h2><p className="mt-3">パソコンではChrome／Edge／Safari、スマートフォンではお使いのブラウザで、園から届いたURLを開きます。URLが分からない場合は園の管理者へ確認してください。</p><p className="mt-3">ここでは実際のサイトを開かず、練習のログイン画面へ進みます。</p><button type="button" className="btn-primary training-open-login mt-4" onClick={onAdvance}>練習のログイン画面へ</button></section>;
 if(step.screen==='login'||step.screen==='logout')return <><p className="message-banner message-info">練習用ID：practice ／ パスワード：Practice123!</p>{step.screen==='logout'&&stage===0?<><button className="btn-secondary mt-4" onClick={()=>setStage(1)}>ログアウト</button>{home}</>:stage===2?<><p role="status">ログインしました。再ログイン時は端末で完了したガイドを繰り返す必要はありません。</p>{home}</>:<LoginPage onSuccess={success}/>}</>;
 if(step.screen==='welcome')return <FirstLoginExperience session={session}><div onClickCapture={()=>signal('welcome-complete')}><p className="message-banner message-info">ホームへ進みました。Welcomeは端末の初回利用ガイドです。園の登録内容は変更しません。</p>{home}<button className="btn-primary" onClick={()=>signal('welcome-complete')}>ホームを確認しました</button></div></FirstLoginExperience>;
 if(step.screen==='windows')return <section className="card"><h2 className="text-xl font-bold">Windows：Chrome／Edgeから開く</h2><p className="mt-3">正式URLを開き、ブラウザのアドレス欄やメニューを確認します。インストール案内の表示は端末・ブラウザ・園の利用環境によって異なります。</p><p className="mt-3">この練習画面では対応可否を自動判定できません。実際の正式画面にAeN Shiftのインストール案内がある場合だけ、次を選んでください。</p><button className="btn-secondary mt-4" onClick={()=>{setStage(1);signal('windows-complete');}}>案内がない・確認できない</button><button className="btn-secondary mt-4" onClick={()=>setStage(2)}>Windowsの正式画面でインストール案内を確認した</button>{stage===1&&<p role="status">ブラウザからそのまま利用できます。インストールは必須ではありません。</p>}{stage>=2&&<div className="mt-4"><p>案内に従ってインストールできた場合は、作成されたショートカットやスタートメニューから起動できます。デスクトップにアイコンがない場合はスタートメニューを確認してください。</p><button className="btn-primary mt-4" onClick={()=>{setStage(3);signal('windows-complete');}}>デスクトップからAeN Shiftを起動する（練習）</button>{stage===3&&<><p role="status">AeN Shiftを開きました（練習）。実際のインストールは行っていません。</p>{home}</>}</div>}</section>;
 if(step.screen==='review')return <section className="card"><h2 className="text-xl font-bold">初期設定完了後の確認</h2><button className="btn-secondary mt-4" onClick={()=>setStage(1)}>園設定</button>{stage>=1&&<button data-training-target={stage===1} className="btn-primary mt-4" onClick={()=>setStage(2)}>登録内容を確認する</button>}{stage>=2&&<><p className="message-banner message-info mt-4">確認専用です。正式な園の構成は職員23名（保育18名・子育て支援2名・給食3名）、生成対象20名です。給食3名は固定勤務として別に扱います。ここでは4名の匿名例で職員・部署・クラス・勤務条件・固定勤務・子育て支援・給食を確認します。固定勤務があることとローテーション全体からの除外は同じ意味ではありません。</p><WorkforceReviewStep setup={reviewFixture()} step={stage===2?2:3}/><button data-training-target={stage>=2} className="btn-primary mt-4" onClick={()=>{if(stage===2)setStage(3);else {setStage(4);signal('review-complete');}}}>{stage===2?'職員・クラス設定へ':'登録内容を確認しました'}</button></>}</section>;
 if(step.screen==='confirmed')return <><ShiftManagement session={session}/><button className="btn-primary mt-4">確定シフトを確認しました</button></>;
 if(step.screen==='share')return <section className="card"><h2 className="text-xl font-bold">職員へ最終決定を知らせる</h2><p className="mt-3">職員は通知と月間シフトで確定した勤務を確認します。園の取り決めに従ってお知らせしてください。</p><div className="message-banner message-info mt-4">シフトが最終決定されました（練習用のお知らせ）</div><button className="btn-primary mt-4" onClick={()=>setStage(1)}>職員の月間シフトを開く</button>{stage===1&&<PersonalCalendar token={token}/>}<p className="mt-3 text-sm">練習から職員へ通知・送信は行いません。</p></section>;
 if(step.screen==='post-swap')return <SwapExercise/>;
 if(step.screen.startsWith('practice-')){
 const state=practiceState();
 const read=(children:React.ReactNode)=><>{children}<button className="btn-primary mt-4">{step.target}</button></>;
 const action=(name:string)=>{try{practiceAction(name);setStage(stage+1);setMessage(name==='eligible'?'最終決定できます。':name==='reevaluate'?'15日の保育士Bを⑥に配置しました。必要1名・配置1名。不足0名です。':'回答済みです。まだ配置を変更していません。');signal(`practice-${name}`);}catch(e){setMessage((e as Error).message);}};
 if(step.screen==='practice-month')return <section className="card"><h2 className="text-xl font-bold">1か月のシフトを作ってみる</h2><p>練習用の園・4名の匿名データを使います。途中再開では同じ手順の開始時点を復元します。</p><label className="mt-4 block">対象月<select className="input" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">選んでください</option><option value={month}>{month}</option></select></label><button disabled={!selected} className="btn-primary mt-4">この月で始める</button></section>;
 if(step.screen==='practice-requests')return read(<><p className="message-banner message-info">練習例では管理者が月次入力を提出確認済みです。保育士Aの希望休は20日です。職員の申請が0件でも、管理者の提出確認前は未提出です。</p><RequestManagement session={session}/></>);
 if(step.screen==='practice-leave')return read(<><p className="message-banner message-info">保育士A：22日に1日有給、23日に午前半休。1日と半日の違いを確認してください。</p><RequestManagement session={session}/></>);
 if(step.screen==='practice-events')return read(<TenantCalendarManagement token={token}/>);
 if(step.screen==='practice-closed')return read(<ShiftSettings session={session}/>);
 if(step.screen==='practice-requirements')return read(<StaffingRequirementManagement session={session}/>);
 if(['practice-precheck','practice-draft','practice-final'].includes(step.screen))return <><p className="message-banner message-info">{month}の練習。DRAFT（下書き）を確認し、「確定」でFINAL（最終決定）します。</p><ShiftManagement session={session}/></>;
 if(step.screen==='practice-shortage')return <section className="card"><button className="btn-primary" onClick={()=>{practiceAction('shortage');setStage(1);}}>不足を1件発生させる</button>{stage>0&&<><p role="alert">15日：⑥が1名不足しています。</p><button data-training-target="true" className="btn-secondary mt-4" onClick={async()=>{try{await api.confirmShift(token,month);}catch(e){setMessage((e as Error).message);signal('practice-blocked');}}}>最終決定を試す</button></>}{message&&<p role="status">{message}</p>}</section>;
 if(step.screen==='practice-decisions')return <section className="card"><button className="btn-primary" onClick={()=>setStage(1)}>確認事項を開く</button>{stage===1&&<p>15日の⑥：必要1名、配置0名。保育士Bは希望休がなく、⑥に勤務可能です。保育士Bへの配置変更を回答します。</p>}</section>;
 if(['practice-answer','practice-reevaluate','practice-eligibility'].includes(step.screen))return <section className="card"><h2 className="text-xl font-bold">{step.title}</h2><p className="mt-3">人数不足：{state.shortage?'1件':'0件'}／回答：{state.answered?'済み':'未回答'}／再評価：{state.evaluated?'済み':'未実施'}</p><button className="btn-primary mt-4" onClick={()=>action(step.screen.replace('practice-','').replace('eligibility','eligible'))}>{step.target}</button>{message&&<p role="status" className="mt-4">{message}</p>}</section>;
 if(step.screen==='practice-recheck')return read(<><p className="message-banner message-info">15日：保育士Bの⑥、22日：有給、23日：午前半休、28日：休園を確認してください。</p><ShiftManagement session={session}/></>);
 }
 return null;
}

function SwapExercise(){
 const [ready,setReady]=useState(false);const [manager,setManager]=useState(false);const [submitted,setSubmitted]=useState(false);
 useEffect(()=>{prepareSwapExercise();trainingRole('STAFF');setReady(true);const listener=(e:Event)=>{const d=(e as CustomEvent).detail;if(d.name==='createShiftSwap'&&d.ok)setSubmitted(true);};window.addEventListener('training:action',listener);return()=>{window.removeEventListener('training:action',listener);};},[]);
 if(!ready)return null;
 return <><p className="message-banner message-info">{manager?'管理者として内容を確認し、承認します。':'職員として保育士Bと21日の交換を申請します。'} 練習用の役割切り替えです。</p><ShiftSwapManagement key={String(manager)} session={sessionFor(manager?'ADMIN':'STAFF')}/>{submitted&&!manager&&<button className="btn-primary mt-4" onClick={()=>{trainingRole('ADMIN');setManager(true);}}>管理者として申請を確認</button>}</>;
}
