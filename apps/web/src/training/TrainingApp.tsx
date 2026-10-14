import { useEffect, useLayoutEffect, useState } from 'react';
import { HomeDashboard } from '../features/dashboard/HomeDashboard';
import { StaffManagement } from '../features/staff/StaffManagement';
import { WorkPatternManagement } from '../features/work-patterns/WorkPatternManagement';
import { StaffingRequirementManagement } from '../features/settings/StaffingRequirementManagement';
import { StaffWorkRuleManagement } from '../features/staff/StaffWorkRuleManagement';
import { PaidLeaveManagement } from '../features/staff/PaidLeaveManagement';
import { RequestManagement } from '../features/requests/RequestManagement';
import { TenantCalendarManagement } from '../features/calendar/TenantCalendarManagement';
import { ShiftSettings } from '../features/settings/ShiftSettings';
import { MonthlySubmissionPanel } from '../features/manager-resolution/MonthlySubmissionPanel';
import { ShiftManagement } from '../features/shifts/ShiftManagement';
import { ShiftSwapManagement } from '../features/shift-swaps/ShiftSwapManagement';
import { NotificationManagement } from '../features/notifications/NotificationManagement';
import { PersonalCalendar } from '../features/calendar/PersonalCalendar';
import { adminPrintHtml } from '../features/exports/shift-print-layout';
import { api, fixtureSummary, month, startPractical, resetFixture, sessionFor, staffFixture, today } from './mock-client';
import { courses, courseNames, type Course, type Step } from './courses';
import { AdditionalScreen } from './AdditionalScreens';
import { ErrorBoundary } from '../components/ErrorBoundary';
import './training.css';


const announce = (name:string, ok=true) => window.dispatchEvent(new CustomEvent('training:action',{detail:{name,ok}}));
export function TrainingApp() {
  const [embeddedPrint,setEmbeddedPrint]=useState('');
  useEffect(()=>{const show=(e:Event)=>setEmbeddedPrint((e as CustomEvent<string>).detail.replace(/<div class="toolbar">[\s\S]*?<\/div>/,''));window.addEventListener('training:print',show);return()=>window.removeEventListener('training:print',show);},[]);
  const [operationError,setOperationError]=useState('');
  useEffect(()=>{const handle=(e:PromiseRejectionEvent)=>{e.preventDefault();setOperationError(e.reason instanceof Error?e.reason.message:'操作を完了できませんでした。入力内容を確認してください。');};window.addEventListener('unhandledrejection',handle);return()=>window.removeEventListener('unhandledrejection',handle);},[]);
  const [course,setCourse]=useState<Course|null>(null); const [index,setIndex]=useState(0); const [epoch,setEpoch]=useState(0); const [done,setDone]=useState(false); const [complete,setComplete]=useState(false); const [restored,setRestored]=useState<{course:Course;index:number}|null>(null);
  const steps=courses[course??'admin']; const step=steps[index]; const role=course==='staff'?'STAFF':'ADMIN';
  function enter(c:Course,i=0,continuous=false){const ss=courses[c];const next=Math.max(0,Math.min(i,ss.length-1));if(c==='practical'){if(!continuous)startPractical(next);}else resetFixture(ss[next].id,c==='staff'?'STAFF':'ADMIN');setOperationError('');setRestored({course:c,index:next});setCourse(c);setIndex(next);setDone(false);setComplete(false);setEpoch(e=>e+1);}
  function goBack(){
    if(embeddedPrint){setEmbeddedPrint('');return;}
    // Reused onboarding can consume Back for its internal welcome/tutorial screens.
    if(!window.dispatchEvent(new Event('training:back',{cancelable:true})))return;
    if(complete){setComplete(false);enter(course!,index);return;}
    if(course&&index>0)enter(course,index-1);else setCourse(null);
  }
  useEffect(()=>{const back=(e:MessageEvent)=>{if(e.source===parent&&e.data?.type==='aen-training:back')goBack();};window.addEventListener('message',back);return()=>window.removeEventListener('message',back);},[course,index,complete,embeddedPrint]);
  useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.source!==parent||!['aen-training:restore','aen-training:navigate'].includes(e.data?.type))return;const p=e.data.progress;if(e.data.type==='aen-training:navigate'&&p===null){setCourse(null);return;}if(p&&['admin','practical','staff'].includes(p.course)&&Number.isInteger(p.index)&&p.index>=0&&p.index<courses[p.course as Course].length){if(e.data.type==='aen-training:navigate')enter(p.course,p.index);else setRestored(p);}};window.addEventListener('message',receive);parent.postMessage({type:'aen-training:ready'},'*');return()=>window.removeEventListener('message',receive);},[]);
  useLayoutEffect(()=>{if(!course)return;window.scrollTo(0,0);document.getElementById('training-heading')?.focus({preventScroll:true});},[course,index,epoch]);
  useEffect(()=>{parent.postMessage(course?{type:'aen-training:progress',progress:{course,index}}:{type:'aen-training:top'},'*');},[course,index]);
  useEffect(()=>{if(!course)return;const listener=(e:Event)=>{const d=(e as CustomEvent).detail;if(d.name===step.action&&Boolean(d.ok)!==Boolean(step.failure)){if(step.id==='paid-day'&&d.unit!=='DAY'||step.id==='paid-half'&&d.unit!=='HALF_DAY'||step.id==='half-request'&&!['PAID_LEAVE','HALF_DAY_AM','HALF_DAY_PM'].includes(d.requestType))return;setDone(true);}};window.addEventListener('training:action',listener);return()=>window.removeEventListener('training:action',listener);},[course,index]);
  useEffect(()=>{if(!course)return;const highlight=()=>{document.querySelectorAll('.training-target').forEach(e=>e.classList.remove('training-target'));const candidates=Array.from(document.querySelectorAll<HTMLElement>('#practice-screen button, #practice-screen summary'));const contextual=document.querySelector<HTMLElement>('#practice-screen [data-training-target="true"]')||(step.screen==='welcome'?candidates.find(e=>['はじめる','次へ','ホームを見る','ホームを確認しました'].includes(e.textContent??'')):null);const target=contextual??(step.target==='calendar-day'?candidates.find(e=>e.getAttribute('aria-label')?.includes('日')):candidates.find(e=>!e.hasAttribute('disabled')&&e.textContent?.includes(step.target)));target?.classList.add('training-target');};const observer=new MutationObserver(highlight);const root=document.getElementById('practice-screen');if(root)observer.observe(root,{childList:true,subtree:true});highlight();return()=>{observer.disconnect();document.querySelectorAll('.training-target').forEach(e=>e.classList.remove('training-target'));};},[course,index,epoch]);
  if(embeddedPrint)return <main className="training-workspace card"><h1>A4印刷プレビュー</h1><p>匿名の練習用勤務表です。端末の印刷画面でPDF保存も選べます。</p><button className="btn-secondary" onClick={()=>setEmbeddedPrint('')}>← 練習ガイドへ戻る</button><button className="btn-primary" onClick={()=>window.print()}>端末の印刷画面を開く</button><iframe title="A4印刷プレビュー" className="training-print" sandbox="" srcDoc={embeddedPrint}/><PrintCopy html={embeddedPrint}/></main>;
  if(!course)return <main className="training-start"><p className="eyebrow">AeN Shift</p><h1 className="mt-3 text-3xl font-black">操作練習ガイド</h1><p className="mt-4 text-[var(--ink-muted)]">いつもの画面で、ひとつずつ。<br/>押して、試して、操作を覚えましょう。</p>{restored&&<button className="btn-primary mt-6" onClick={()=>enter(restored.course,restored.index)}>続きから再開（{courseNames[restored.course]} {restored.index+1}）</button>}<div className="mt-8 grid gap-4 sm:grid-cols-2">{(['admin','practical','staff'] as Course[]).map(c=><button key={c} className="card training-course" onClick={()=>enter(c)}><span className="action-symbol">{c==='staff'?'職':'管'}</span><strong className="mt-4 block text-xl">{courseNames[c]}</strong><span className="mt-2 block text-sm">{c==='practical'?'1か月のシフトを作ってみる':c==='admin'?`初回利用から最終決定後まで｜${courses.admin.length}ステップ`:'今日の勤務・希望休・通知・交換｜6ステップ'}</span><span className="mt-5 block font-bold text-[var(--brand)]">練習を始める →</span></button>)}</div><p className="mt-6 text-sm text-[var(--ink-muted)]">匿名の練習データを使用します。実践編は操作を引き継いで進みます。保存するのは進んだ位置だけです。途中再開・戻る・やり直すときは、その手順の開始時点の練習例を復元します。</p></main>;
  if(complete)return <main className="training-start card"><p className="eyebrow">練習完了</p><h1 className="mt-3 text-2xl font-black">{courseNames[course]}を完了しました</h1><p className="mt-4">実際のデータは変更されていません。</p><button className="btn-primary mt-6" onClick={()=>parent.postMessage({type:'aen-training:exit'},'*')}>練習を終了してAeN Shiftへ戻る</button><button className="btn-secondary mt-4" onClick={goBack}>← 練習ガイドへ戻る</button><button className="btn-quiet mt-4" onClick={()=>setCourse(null)}>コース選択へ</button></main>;
  return <><aside className="training-coach" aria-label="操作の案内"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{courseNames[course]} <span data-testid="progress">{index+1} / {steps.length}</span></strong><button className="btn-quiet" onClick={()=>setCourse(null)}>コース選択</button></div><progress className="w-full" value={index+(done?1:0)} max={steps.length}/><h1 id="training-heading" tabIndex={-1} className="mt-2 text-lg font-black">{step.title}</h1><p id="training-instruction" className="mt-2 text-sm leading-6">↓ {step.instruction}</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary" onClick={goBack}>← 練習ガイドへ戻る</button><button data-testid="next" className="btn-primary" disabled={!done} onClick={()=>{if(index===steps.length-1){setComplete(true);setRestored(null);parent.postMessage({type:'aen-training:clear'},'*');}else enter(course,index+1,true);}}>{index===steps.length-1?'練習を完了':'次へ →'}</button>{index>0&&<details className="training-options"><summary className="btn-quiet">補助メニュー</summary><button className="btn-quiet" onClick={()=>enter(course,index)}>やり直す</button><button className="btn-quiet" onClick={()=>{if(window.confirm('このコースを最初からやり直しますか？'))enter(course,0);}}>最初からやり直す</button><button className="btn-quiet" onClick={()=>document.querySelector('.training-target')?.scrollIntoView({block:'center'})}>操作位置へ</button></details>}</div><p role="status" className="mt-2 text-sm font-bold text-[var(--brand)]">{done?'✓ 操作を確認しました。「次へ」で進みましょう。':step.id==='access'?'下のオレンジ色の「練習のログイン画面へ」を押してください。':`「${step.target==='calendar-day'?'カレンダーの日付':step.target}」を操作してください。`}</p></aside><main className="training-workspace">{operationError&&<p role="alert" className="message-banner message-warning mb-4">{operationError}<button className="btn-quiet" onClick={()=>setOperationError('')}>閉じる</button></p>}<header className="mb-5 border-b pb-4"><p className="eyebrow">AeN Shift｜練習用の園</p><p className="mt-1 text-sm">{role==='ADMIN'?'管理者A':'保育士A'}さん</p></header><ErrorBoundary key={`${course}-${index}-${epoch}`}><div id="practice-screen" data-training-screen={step.screen} data-training-step={step.id} aria-describedby="training-instruction" onClickCapture={e=>{const button=(e.target as HTMLElement).closest('button,summary');if(!step.action&&button&&(step.target==='calendar-day'?button.getAttribute('role')==='gridcell':button.textContent?.includes(step.target)))setDone(true);}}><Screen step={step} role={role} onAdvance={()=>enter(course,index+1,true)} /></div></ErrorBoundary></main></>;
}
function Screen({step,role,onAdvance}:{step:Step;role:'ADMIN'|'STAFF';onAdvance:()=>void}) {
  const [homeView,setHomeView]=useState('home');
  useEffect(()=>{const back=(e:Event)=>{if(step.screen==='home'&&homeView!=='home'){e.preventDefault();setHomeView('home');}};window.addEventListener('training:back',back);return()=>window.removeEventListener('training:back',back);},[homeView,step.screen]);
  const session=sessionFor(role);const token=session.accessToken;const [detail,setDetail]=useState(false);const [revision,setRevision]=useState(0);const [printHtml,setPrintHtml]=useState('');
  switch(step.screen) {
    case 'home':return homeView==='notifications'?<NotificationManagement session={session} onUnreadChange={()=>{}} onNavigate={setHomeView}/>:homeView==='requests'?<RequestManagement session={session}/>:homeView==='swaps'?<ShiftSwapManagement session={session}/>:homeView==='calendar'?<PersonalCalendar token={token}/>:homeView==='shifts'?<ShiftManagement session={session}/>:<HomeDashboard session={session} notifications={[{id:'practice-notice',type:'SHIFT_CONFIRMED',title:'練習用のお知らせ',message:'勤務を確認しましょう',isRead:false,createdAt:today}]} onOpen={setHomeView}/>;
    case 'staff':return <StaffManagement token={token}/>;
    case 'patterns':return <WorkPatternManagement token={token}/>;
    case 'requirements':return <StaffingRequirementManagement session={session}/>;
    case 'fixed':return detail ? <button className="btn-primary" onClick={()=>setDetail(false)}>勤務条件を開く</button> : <StaffWorkRuleManagement token={token} staff={staffFixture[step.id==='support'?2:step.id==='kitchen'?3:0]} onClose={()=>setDetail(true)} readOnly={false}/>;
    case 'paid':return <PaidLeaveManagement token={token}/>;
    case 'requests':return <RequestManagement session={session}/>;
    case 'events':return <TenantCalendarManagement token={token}/>;
    case 'settings':return <ShiftSettings session={session}/>;
    case 'shifts':return <><p className="message-banner message-info">{step.id==='final'?'確認事項が解消された練習例です。':'DRAFT（下書き）で内容を確認します。'} 「確定」はFINAL（最終決定）です。</p><ShiftManagement session={session} onOpenDecisions={()=>setDetail(true)}/>{detail&&<p className="message-banner message-warning">⑥が1名不足しています。管理者の回答後、再評価して確認します。</p>}</>;
    case 'swaps':return <ShiftSwapManagement session={session}/>;
    case 'notifications':return <NotificationManagement session={session} onUnreadChange={()=>{}}/>;
    case 'calendar':return <PersonalCalendar token={token}/>;
    case 'submission':return <MonthlySubmissionPanel token={token} month={month} onReady={ready=>{if(ready)announce('submission');}}/>;
    case 'decisions':case 'answer':case 'reevaluate':return <ShiftManagement session={session}/>;
    case 'metrics': {const m=fixtureSummary();return <section className="card" data-revision={revision}><h2 className="text-xl font-bold">有給休暇の確認</h2><p className="mt-3 text-sm">練習例：年間10日付与、繰越なし。取得率＝取得日数÷年間付与日数。法定5日の対象者を想定しています。</p><div className="mt-5 grid grid-cols-2 gap-3">{[['年間付与',`${m.granted}日`],['取得',`${m.used}日`],['残日数',`${m.remaining}日`],['取得率',`${m.rate}%`],['5日までの残り',`${m.statutoryRemaining}日`]].map(([l,v])=><div className="time-block" key={l}><p>{l}</p><strong className="text-2xl">{v}</strong></div>)}</div>{(['DAY','HALF_DAY'] as const).map(unit=><button key={unit} className="btn-primary mt-4 mr-2" disabled={m.remaining<(unit==='DAY'?1:0.5)} onClick={async()=>{await api.confirmPaidLeaveUsage(token,staffFixture[0].id,{usageDate:today,unit,allocations:[{grantId:'practice-grant',allocatedHalfDays:unit==='DAY'?2:1}],decisionNote:'練習の相談結果'});setRevision(v=>v+1);}}>{unit==='DAY'?'1日':'半日'}を取得</button>)}</section>;}
    case 'print':return <section className="card"><h2 className="text-xl font-bold">印刷／PDF</h2><p className="mt-3 text-sm">練習用の勤務表です。印刷・保存はお使いの端末の印刷画面で行います。</p><button className="btn-primary mt-4" onClick={async()=>setPrintHtml(adminPrintHtml(await api.printShifts(token,month,false),'',{paper:'A4',orientation:'landscape'}).replace(/<div class="toolbar">[\s\S]*?<\/div>/,''))}>A4印刷プレビュー</button><button className="btn-secondary mt-4 ml-2" onClick={()=>setDetail(true)}>PDF保存の練習</button>{detail&&<p className="message-banner message-info mt-4">PC：印刷先を「PDFとして保存」にします。iPhone：印刷プレビューを開き、共有からファイルへ保存します。Android：印刷先の「PDF形式で保存」を選びます。</p>}{printHtml&&<><p className="mt-4">A4・横向き／練習用の園</p><iframe title="A4印刷プレビュー" className="training-print" sandbox="" srcDoc={printHtml}/><PrintCopy html={printHtml}/><button className="btn-secondary mt-4" onClick={()=>window.print()}>端末の印刷画面を開く</button></>}</section>;
    case 'help':return <section className="card"><h2 className="text-xl font-bold">困ったとき</h2><button className="btn-primary mt-4" onClick={()=>setDetail(true)}>管理者への相談内容を確認</button>{detail&&<p className="message-banner message-info mt-4">Pilot中に困った場合は、園で案内された報告先へ「どの画面」「いつ」「何を押したか」「何が起きたか」を伝えます。可能ならスクリーンショットも添えてください。職員は園の管理者へ、管理者は案内されたサポート窓口へ相談します。パスワードは伝えません。</p>}</section>;
    default:return <AdditionalScreen step={step} onAdvance={onAdvance}/>;
  }
}

function PrintCopy({html}:{html:string}) {
 const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
 const body=(html.match(/<body>([\s\S]*?)<\/body>/)?.[1]??'').replace(/<button[\s\S]*?<\/button>/g,'');
 return <div className="training-print-copy"><style>{`@media print {${css}}`}</style><div dangerouslySetInnerHTML={{__html:body}}/></div>;
}
