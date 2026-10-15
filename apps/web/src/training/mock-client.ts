/** Training build ONLY. Never import a production transport or read a credential here. */
import type { api as ProductionApi, Session, Staff, WorkPattern, SetupState } from '../api/client';
export class ApiResponseError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) { super(message); this.name = 'ApiResponseError'; }
}
export const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
export const month = today.slice(0, 7);
const stamp = `${today}T09:00:00+09:00`;
export const sessionFor = (role: 'ADMIN' | 'STAFF'): Session => ({ accessToken: `training-${role}`, role, mustChangePassword: false, user: { id: 'practice-user', loginId: 'practice', email: null, displayName: role === 'ADMIN' ? '管理者A' : '保育士A' }, tenant: { id: 'practice-only', name: '練習用の園' } });
export const staffFixture = ['保育士A', '保育士B', '子育て支援A', '給食A'].map((displayName, i) => ({ id: `practice-staff-${i}`, tenantId: 'practice-only', userId: i === 0 ? 'practice-user' : `practice-user-${i}`, employeeNumber: `練習${i + 1}`, displayName, email: null, jobTitle: i === 3 ? '給食' : i === 2 ? '子育て支援' : '保育士', employmentType: 'FULL_TIME', assignedClass: i < 2 ? 'AGE_0' : 'SUPPORT', canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true, regularWorkStartTime: '09:00', regularWorkEndTime: '18:00', monthlyWorkHourLimit: 160, monthlyTargetWorkDays: 20, monthlyTargetWorkHours: 160, weeklyAvailableDays: 5, isActive: true, isDirector: false, notes: '匿名の練習用データ', createdAt: stamp, updatedAt: stamp })) as Staff[];
const patternsFixture = Array.from('①②③④⑤⑥⑦⑧⑨').map((n, i) => ({ id: `practice-pattern-${i}`, tenantId: 'practice-only', code: n, name: `勤務${n}`, shortName: n, displayOrder: i, startTime: `${String(7 + Math.floor(i / 3)).padStart(2, '0')}:${i % 3 === 0 ? '00' : i % 3 === 1 ? '15' : '30'}`, endTime: `${16 + Math.floor(i / 3)}:${i % 3 === 0 ? '00' : i % 3 === 1 ? '15' : '30'}`, breakMinutes: 60, color: '#2f6b57', isWorking: true, isDefault: i === 4, isSystem: false, isActive: true, createdAt: stamp, updatedAt: stamp })) satisfies WorkPattern[];
const settingsFixture = { fiscalYearStartMonth: 4, weekdayEarlyRequired: 2, weekdayLateRequired: 2, saturdayEarlyRequired: 1, saturdayLateRequired: 1, saturdayMinimumStaff: 2, saturdayOperationEnabled: true, sundayOperationEnabled: false, directorCountsTowardStaffing: false, directorClassPlacementMode: 'NONE', maxConsecutiveWorkDays: 6, maxConsecutiveEarlyDays: 2, maxConsecutiveLateDays: 2, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '09:00', defaultEndNormal: '18:00', defaultStartLate: '10:00', defaultEndLate: '19:00', defaultBreakMinutes: 60 };
// Deliberately isolated mutable fixture store. It is discarded when a lesson restarts.
// All public return values are cloned; components cannot mutate the store by reference.
let db: Record<string, any>;
let lesson = '';
let role: 'ADMIN' | 'STAFF' = 'ADMIN';
let serial = 0;
let practice = {active:false,generated:false,shortage:false,answered:false,evaluated:false,eligible:false};
const clone = <T,>(value: T): T => structuredClone(value);
export function resetFixture(nextLesson: string, nextRole: 'ADMIN' | 'STAFF') {
  practice = {active:false,generated:false,shortage:false,answered:false,evaluated:false,eligible:false};
  lesson = nextLesson; role = nextRole; serial = 0;
  db = { staff: clone(staffFixture), patterns: clone(patternsFixture), settings: clone(settingsFixture), classes: ['AGE_0','AGE_1','AGE_2','AGE_3','AGE_4','AGE_5'].map((classType, i) => ({ id: `class-${i}`, classType, weekdayRequired: 2, saturdayRequired: 1, isActive: true })), closed: [], events: [], exceptions: [], requirements: [], grants: [{ id: 'practice-grant', staffId: staffFixture[0].id, grantDate: `${month}-01`, validFrom: `${month}-01`, expiresAt: `${Number(today.slice(0,4))+1}-12-31`, grantedHalfDays: 20, source: 'NORMAL_GRANT', note: '練習', voidedAt: null, allocations: [] }], usages: [], rules: {}, status: nextRole === 'STAFF' || nextLesson === 'home' || ['swaps','confirmed','post-print','share','post-swap'].includes(nextLesson) ? 'CONFIRMED' : 'DRAFT', checked: false, answered: false,
    requests: [{ id: 'practice-request', staffId: staffFixture[0].id, tenantId: 'practice-only', requestDate: `${month}-20`, requestType: 'DAY_OFF', status: 'PENDING', reason: '練習の申請', adminComment: null, staff: clone(staffFixture[0]), createdAt: stamp, updatedAt: stamp }],
    notifications: [{ id: 'practice-notice', title: 'シフトが最終決定されました', message: '月間シフトで出勤時刻を確認しましょう。', type: 'SHIFT_CONFIRMED', isRead: false, createdAt: stamp }],
    swaps: [{ id: 'practice-swap', requesterId: 'practice-user', targetMemberId: 'practice-user-1', requestDate: `${month}-21`, status: 'PENDING', requestComment: '練習の交換申請', adminComment: null, createdAt: stamp, requester: { id: 'practice-user', displayName: '保育士A', email: '' }, targetMember: { id: 'practice-user-1', displayName: '保育士B', email: '' } }] };
  db.submissions=['REQUESTS','LEAVE','EVENTS','CLOSED_DATES'].map(category=>({category,state:nextLesson==='submission'?'NOT_SUBMITTED':'SUBMITTED_WITH_DATA',count:category==='REQUESTS'?1:0,pending:0,revision:1,inputDigest:'anonymous-training',confirmedAt:nextLesson==='submission'?null:stamp}));
  db.submissions.forEach((x:any)=>{if(x.state!=='NOT_SUBMITTED'&&x.count===0)x.state='SUBMITTED_EMPTY';});
  db.reviews=['decisions','answer','reevaluate'].includes(nextLesson)?[{id:'practice-review',groupId:'practice-review',revision:1,dates:[`${month}-23`],targetLabel:'保育士A',kind:'HALF_DAY_BASE',reason:'半休の日の基礎勤務を確認してください',knownConditions:['23日は午前半休です。基礎勤務の指定が必要です。'],impact:'回答を反映した後、生成前チェックと下書き再生成で勤務全体を再評価します。',status:nextLesson==='reevaluate'?'ANSWERED_PENDING_REEVALUATION':'NEEDS_MANAGER_REVIEW',options:[{value:'PATTERN_6',label:'勤務⑥を基礎勤務にする'}],answer:nextLesson==='reevaluate'?{option:'PATTERN_6'}:null}]:[];
  db.needsRegeneration=false;

}
resetFixture('home', 'ADMIN');
export function fixtureSummary() { const used = db.usages.filter((u: any) => u.status === 'CONFIRMED').reduce((n: number,u: any) => n+u.usedHalfDays,0); const granted=db.grants.reduce((n:number,g:any)=>n+g.grantedHalfDays,0); return { granted:granted/2, used:used/2, remaining:(granted-used)/2, rate:granted ? Math.round(used/granted*100):0, statutoryRemaining: Math.max(0,5-used/2) }; }
const diagnostic = () => ({ severity:'ERROR', category:'BUSINESS_DECISION_REQUIRED', code:'PRACTICE_SHORTAGE', staffId:null, date:`${month}-15`, source:'練習の必要人数', reason:'⑥が1名不足しています', impact:'この条件では最終決定できません', allowedActions:['勤務条件と希望休を確認し、管理者確認事項へ回答する'], overrideAllowed:false });
function assignments(targetMonth: string, own = false) { return (own ? db.staff.slice(0,1) : db.staff).flatMap((s:any, i:number) => Array.from({length:new Date(Number(targetMonth.slice(0,4)),Number(targetMonth.slice(5,7)),0).getDate()},(_,d)=>({ id:`${s.id}-${d}`, tenantId:'practice-only', monthlyShiftId:'practice-shift', staffId:s.id, workDate:`${targetMonth}-${String(d+1).padStart(2,'0')}`, shiftType:'NORMAL', startTime:i===3?'08:30':'09:00', endTime:i===3?'16:30':'18:00', breakMinutes:60, note:'練習用', assignedClass:s.assignedClass, workPattern:db.patterns[4], staff:s, updatedAt:stamp, ...(db.assignmentEdits?.[`${s.id}:${targetMonth}-${String(d+1).padStart(2,'0')}`]??{}) }))); }
function shiftView(targetMonth = month, staffId?: string) { return { schedule:{id:'practice-shift',tenantId:'practice-only',targetMonth,status:db.status,createdAt:stamp,updatedAt:stamp,confirmedAt:db.status==='CONFIRMED'?stamp:null}, staff:role==='STAFF'?db.staff.slice(0,1):db.staff, assignments:assignments(targetMonth,role==='STAFF').filter((a:any)=>!staffId||a.staffId===staffId), requests:db.requests, warnings:(lesson==='shortage'||(practice.active&&practice.shortage))?[{code:'PRACTICE_SHORTAGE',staffId:staffFixture[0].id,workDate:`${month}-15`,message:'⑥が1名不足しています',severity:'blocking'}]:[] }; }
function insert(list:string, input:any) { const row={id:`practice-new-${++serial}`,tenantId:'practice-only',createdAt:stamp,updatedAt:stamp,...input}; db[list].push(row); return row; }
function update(list:string,id:string,input:any) { const row=db[list].find((r:any)=>r.id===id); if(!row)throw new Error('練習データが見つかりません。やり直してください。'); Object.assign(row,input);return row; }
const adminOnly = new Set(['setup','monthlySubmission','confirmMonthlySubmission','managerReviews','answerManagerReview','reevaluateManagerReview','staff','requestStaffOptions','createStaff','updateStaff','deactivateStaff','workPatterns','createWorkPattern','updateWorkPattern','deleteWorkPattern','shiftSettings','classRequirements','updateShiftSettings','updateClassRequirements','staffingRequirements','staffAttributes','staffWorkRules','createStaffWorkRule','updateStaffWorkRule','deactivateStaffWorkRule','paidLeaveGrants','paidLeaveUsages','paidLeaveBalance','createPaidLeaveGrant','confirmPaidLeaveUsage','cancelPaidLeaveUsage','tenantEvents','ruleExceptions','createTenantEvent','deleteTenantEvent','createRuleException','deleteRuleException','createClosedDate','deleteClosedDate','precheckShift','generateShift','confirmShift','reopenShift','saveAssignments','updateShiftSwap','createStaffingRequirement','updateStaffingRequirement','deactivateStaffingRequirement']);
function run(name:string, args:any[]) {
  if(name==='login'){if(args[0]!=='practice'||args[1]!=='Practice123!')throw new Error('練習用ID practice とパスワード Practice123! を入力してください。');return sessionFor(role);}
  if (args[0] !== `training-${role}`) throw new Error('練習用の利用者だけが操作できます。');
  if (role==='STAFF'&&adminOnly.has(name)) throw new Error('管理者専用の操作です。');
  const [,a,b,c] = args;
  switch(name) {
    case 'setupReadiness':return {managed:false,ready:false,items:[]};
    case 'setup':return reviewFixture();
    case 'monthlySubmission':return {month:a,items:db.submissions,hasUnsubmitted:db.submissions.some((x:any)=>x.state==='NOT_SUBMITTED')};
    case 'confirmMonthlySubmission':{const item=db.submissions.find((x:any)=>x.category===b);if(!item||item.revision!==c.revision||item.inputDigest!==c.inputDigest||item.pending>0||c.state!==(item.count===0?'SUBMITTED_EMPTY':'SUBMITTED_WITH_DATA'))throw new Error('提出内容を再確認してください。');Object.assign(item,{state:c.state,confirmedAt:stamp,revision:item.revision+1});return item;}
    case 'managerReviews':return db.reviews;
    case 'answerManagerReview':{const item=db.reviews.find((x:any)=>x.id===b);if(!item||item.revision!==c||args[4]?.option!=='PATTERN_6')throw new Error('回答を再確認してください。');Object.assign(item,{answer:args[4],status:'ANSWERED_PENDING_REEVALUATION',revision:item.revision+1});db.checked=false;return item;}
    case 'reevaluateManagerReview':{const item=db.reviews.find((x:any)=>x.id===b);if(!item||item.revision!==c||!item.answer)throw new Error('回答を先に保存してください。');Object.assign(item,{status:'RESOLVED',revision:item.revision+1});db.needsRegeneration=true;db.checked=false;return item;}
    case 'me':return sessionFor(role);
    case 'features': return {enabledFeatures:['BASIC_SHIFT_GENERATION','ADVANCED_WORK_PATTERNS','STAFF_WORK_RULES','ADVANCED_STAFFING_REQUIREMENTS']};
    case 'staff': return db.staff;
    case 'requestStaffOptions':return db.staff;
    case 'createStaff':return insert('staff',a);
    case 'updateStaff':return update('staff',a,b);
    case 'deactivateStaff':return update('staff',a,{isActive:false});
    case 'workPatterns':return db.patterns;
    case 'createWorkPattern':return insert('patterns',a);
    case 'updateWorkPattern':return update('patterns',a,b);
    case 'deleteWorkPattern':return update('patterns',a,{isActive:false});
    case 'shiftSettings':return db.settings;
    case 'updateShiftSettings':Object.assign(db.settings,a);return db.settings;
    case 'classRequirements':return db.classes;
    case 'updateClassRequirements': db.classes=a;return db.classes;
    case 'closedDates':return db.closed;
    case 'createClosedDate':return insert('closed',a);
    case 'deleteClosedDate':db.closed=db.closed.filter((r:any)=>r.id!==a);return {success:true};
    case 'staffAttributes':return [{id:'practice-attribute',code:'保育',name:'保育士',category:'QUALIFICATION',isActive:true}];
    case 'staffingRequirements':return db.requirements;
    case 'createStaffingRequirement':return insert('requirements',{...a,attributeDefinition:{name:'保育士',category:'QUALIFICATION',isActive:true}});
    case 'updateStaffingRequirement':return update('requirements',a,b);
    case 'deactivateStaffingRequirement':return update('requirements',a,{isActive:false});
    case 'staffWorkRules': return db.rules[a] ?? [{id:'practice-rule',staffId:a,ruleType:'FIXED_WORK_PATTERN',workPatternId:db.patterns[4].id,workPattern:db.patterns[4],dayOfWeek:null,startDate:null,endDate:null,startTime:null,endTime:null,numericValue:null,priority:100,isHardConstraint:true,reason:a===staffFixture[2].id?'子育て支援の固定勤務':a===staffFixture[3].id?'給食の固定勤務':'曜日・期間を指定する固定勤務の練習例',isActive:true}];
    case 'createStaffWorkRule': case 'updateStaffWorkRule': { const input=name==='createStaffWorkRule'?b:c; const row={id:'practice-rule',staffId:a,...input,workPattern:db.patterns.find((p:any)=>p.id===input.workPatternId)};db.rules[a]=[row];return row; }
    case 'deactivateStaffWorkRule':db.rules[a]=[];return {success:true};
    case 'paidLeaveGrants':return db.grants.filter((g:any)=>g.staffId===a);
    case 'paidLeaveUsages':return db.usages.filter((u:any)=>u.staffId===a);
    case 'paidLeaveBalance': { const gs=db.grants.filter((g:any)=>g.staffId===a); const us=db.usages.filter((u:any)=>u.staffId===a&&u.status==='CONFIRMED'); const used=us.reduce((n:number,u:any)=>n+u.usedHalfDays,0);const granted=gs.reduce((n:number,g:any)=>n+g.grantedHalfDays,0);return {staffId:a,asOf:today,unit:'HALF_DAY',grantedHalfDays:granted,usedHalfDays:used,availableHalfDays:granted-used,grants:gs.map((g:any)=>({...g,grantId:g.id,usedHalfDays:used,remainingHalfDays:g.grantedHalfDays-used,available:true}))}; }
    case 'createPaidLeaveGrant':if(b.grantedHalfDays<=0||b.expiresAt<b.validFrom)throw new Error('付与量と有効期間を確認してください。');return insert('grants',{...b,staffId:a,voidedAt:null,allocations:[]});
    case 'confirmPaidLeaveUsage': { const amount=b.unit==='DAY'?2:1;if(!b.decisionNote?.trim())throw new Error('相談結果・確定理由を入力してください。');const grant=db.grants.find((g:any)=>g.id===b.allocations[0]?.grantId&&g.staffId===a);if(!grant)throw new Error('付与を選択してください。');const used=db.usages.filter((u:any)=>u.staffId===a&&u.status==='CONFIRMED').reduce((n:number,u:any)=>n+u.usedHalfDays,0);if(used+amount>grant.grantedHalfDays)throw new Error('有給残日数が不足しています。');return insert('usages',{...b,staffId:a,usedHalfDays:amount,status:'CONFIRMED',confirmedAt:stamp}); }
    case 'cancelPaidLeaveUsage':return update('usages',b,{status:'CANCELLED'});
    case 'requests':return db.requests.filter((r:any)=>(!a||r.requestDate.startsWith(a))&&(role!=='STAFF'||r.staffId===staffFixture[0].id)&&(!b||r.staffId===b));
    case 'createRequest':return insert('requests',{...a,staffId:role==='STAFF'?staffFixture[0].id:a.staffId||staffFixture[0].id,status:'PENDING',staff:db.staff.find((s:any)=>s.id===(a.staffId||staffFixture[0].id)),adminComment:null});
    case 'updateRequest':if(role==='STAFF'&&b.status)throw new Error('承認は管理者が行います。');return update('requests',a,b);
    case 'cancelRequest':return update('requests',a,{status:'CANCELLED'});
    case 'tenantEvents':return db.events;
    case 'createTenantEvent':return insert('events',a);
    case 'deleteTenantEvent':db.events=db.events.filter((r:any)=>r.id!==a);return {success:true};
    case 'ruleExceptions':return db.exceptions;
    case 'createRuleException':if(!a.reason?.trim())throw new Error('判断理由を入力してください。');db.answered=true;return insert('exceptions',a);
    case 'deleteRuleException':db.exceptions=db.exceptions.filter((r:any)=>r.id!==a);db.answered=db.exceptions.length>0;return {success:true};
    case 'shifts':return shiftView(a,b);
    case 'myCalendar':return {...shiftView(a),staff:db.staff[0],assignments:assignments(a,true)};
    case 'createShift':if(role==='STAFF')throw new Error('管理者専用の操作です。');db.status='DRAFT';return shiftView(a).schedule;
    case 'precheckShift':db.checked=true;return {canGenerate:true,fatalIssues:[],diagnostics:[],warnings:[],warningSummary:{INFO:0,WARNING:0,ERROR:0,byCode:{}},summary:{activeStaffCount:4,earlyCapableCount:2,lateCapableCount:2,saturdayCapableCount:2,classCounts:{AGE_0:2,SUPPORT:2},closedDateCount:db.closed.length,approvedRequestCount:0,pendingRequestCount:1,settings:db.settings}};
    case 'generateShift':if(!db.checked)throw new Error('生成前チェックを先に行ってください。');if(practice.active){practice.generated=true;practice.eligible=false;practice.evaluated=false;db.assignmentEdits[`${staffFixture[1].id}:${month}-15`]={shiftType:'NORMAL',startTime:patternsFixture[5].startTime,endTime:patternsFixture[5].endTime,workPattern:patternsFixture[5]};practice.shortage=false;}db.needsRegeneration=false;db.status='DRAFT';return {generatedCount:120,workingAssignmentCount:120,offAssignmentCount:0,leaveAssignmentCount:0,warnings:[],warningSummary:{INFO:0,WARNING:0,ERROR:0,byCode:{}},processingTimeMs:1,durationMs:1,appliedSettingsSummary:{},closedDateCount:0};
    case 'saveAssignments':db.assignmentEdits={...db.assignmentEdits,...Object.fromEntries(b.map((x:any)=>[`${x.staffId}:${x.workDate}`,x]))};return shiftView();
    case 'confirmShift':if(db.submissions.some((x:any)=>x.state==='NOT_SUBMITTED')||db.reviews.some((x:any)=>x.status!=='RESOLVED')||db.needsRegeneration)throw new Error('提出確認・回答・再評価・下書き再生成を完了してください。');if(practice.active&&!practiceCanFinalize())throw new ApiResponseError('この条件では最終決定できません。人数不足・回答・再評価・確認を見直してください。',409,{diagnostics:[diagnostic()]});if(lesson==='final-blocked'||lesson==='shortage')throw new ApiResponseError('この条件では最終決定できません。⑥が1名不足しています。管理者確認事項へ回答し、再評価してください。',409,{diagnostics:[diagnostic()]});db.status='CONFIRMED';return shiftView().schedule;
    case 'reopenShift':db.status='DRAFT';return shiftView().schedule;
    case 'notifications':return db.notifications;
    case 'readNotification':return update('notifications',a,{isRead:true});
    case 'readAllNotifications':db.notifications.forEach((n:any)=>n.isRead=true);return {count:db.notifications.length};
    case 'shiftSwaps':return db.swaps;
    case 'shiftSwapTargets':return db.staff.slice(1,2);
    case 'createShiftSwap':if(!a.targetMemberId||!a.requestDate)throw new Error('相手と日付を選んでください。');return insert('swaps',{...a,status:'PENDING',requesterId:'practice-user',requester:{id:'practice-user',displayName:'保育士A'},targetMember:{id:'practice-user-1',displayName:'保育士B'}});
    case 'updateShiftSwap': {const row=update('swaps',a,b);if(b.status==='APPROVED'){const items=assignments(row.requestDate.slice(0,7));const left=items.find((x:any)=>x.staffId===staffFixture[0].id&&x.workDate===row.requestDate);const right=items.find((x:any)=>x.staffId===staffFixture[1].id&&x.workDate===row.requestDate);if(left&&right){const fields=(x:any)=>({shiftType:x.shiftType,startTime:x.startTime,endTime:x.endTime,workPattern:x.workPattern,workPatternId:x.workPatternId});db.assignmentEdits={...db.assignmentEdits,[`${left.staffId}:${row.requestDate}`]:fields(right),[`${right.staffId}:${row.requestDate}`]:fields(left)};}}return row;}
    case 'cancelShiftSwap':return update('swaps',a,{status:'CANCELLED'});
    case 'printShifts':return {tenantName:'練習用の園（実際の勤務表ではありません）',month:a||month,status:db.status,hasUnsubmitted:db.submissions.some((x:any)=>x.state==='NOT_SUBMITTED'),printedAt:stamp,ownOnly:role==='STAFF',closedDates:[],assignments:assignments(a||month,role==='STAFF').map((x:any)=>({employeeNumber:x.staff.employeeNumber,staffName:x.staff.displayName,date:x.workDate,weekday:'',shiftType:({OFF:'休み',PAID_LEAVE:'有給',AM_HALF:'午前半休',PM_HALF:'午後半休'} as Record<string,string>)[x.shiftType]??x.workPattern?.code??'通常',assignedClass:'0歳児',startTime:x.startTime,endTime:x.endTime,breakMinutes:60,note:'練習用'}))};
    default: throw new Error('この操作は練習ガイドの対象外です。正式データには接続しません。');
  }
}
export const api = new Proxy({}, { get(_target,name) { return async (...args:any[]) => { try { if(practice.active&&/^(create|update|delete|deactivate|save|reopen|cancel|confirmPaid)/.test(String(name))&&!['createShiftSwap','updateShiftSwap','cancelShiftSwap'].includes(String(name))){db.checked=false;practice.eligible=false;practice.evaluated=false;}const result=clone(run(String(name),args));window.dispatchEvent(new CustomEvent('training:action',{detail:{name,ok:true,unit:args[2]?.unit,requestType:args[1]?.requestType}}));return result; } catch(error) { window.dispatchEvent(new CustomEvent('training:action',{detail:{name,ok:false}}));throw error; } }; } }) as typeof ProductionApi;

// Session-only checkpoints reconstruct anonymous examples on resume/back. No business data is persisted.
export function practiceState(){return {...practice,status:db.status};}
export function practiceCanFinalize(){return practice.generated&&!practice.shortage&&practice.answered&&practice.evaluated&&practice.eligible;}
export function startPractical(index=0){
 resetFixture('practice','ADMIN');practice.active=true;
 db.events=[{id:'practice-event',eventDate:`${month}-15`,name:'練習の行事',eventType:'OTHER',targetClasses:[],targetStaffCodes:[],allowedWorkPatternCodes:['⑥'],fixedTimeStaffAllowed:true,note:'⑥が1名必要',sourceType:'MANUAL',sourceReference:null,confirmedAt:stamp}];
 db.closed=[{id:'practice-closed',closedDate:`${month}-28`,name:'練習の休園日',note:''}];
 db.requests=[...db.requests.map((r:any)=>({...r,status:'APPROVED'})),...['PAID_LEAVE','HALF_DAY_AM'].map((requestType,i)=>({...db.requests[0],id:`practice-leave-${i}`,requestDate:`${month}-${22+i}`,requestType,status:'APPROVED'}))];
 db.requirements=[{id:'practice-req',code:'PRACTICE',name:'15日の⑥',requiredCount:1,workPatternId:patternsFixture[5].id,workPattern:patternsFixture[5],attributeDefinition:{name:'保育士',category:'QUALIFICATION'},constraintLevel:'HARD',dayOfWeek:null,startDate:`${month}-15`,endDate:`${month}-15`,classType:null,isActive:true}];
 db.assignmentEdits={};for(const s of db.staff)db.assignmentEdits[`${s.id}:${month}-28`]={shiftType:'OFF',startTime:null,endTime:null,workPattern:null};
 for(const [date,type] of [['20','OFF'],['22','PAID_LEAVE'],['23','AM_HALF']])db.assignmentEdits[`${staffFixture[0].id}:${month}-${date}`]={shiftType:type,startTime:type==='AM_HALF'?'13:00':null,endTime:type==='AM_HALF'?'18:00':null,workPattern:null};
 if(index>6)db.checked=true;
 if(index>7){practice.generated=true;db.assignmentEdits[`${staffFixture[1].id}:${month}-15`]={shiftType:'NORMAL',startTime:patternsFixture[5].startTime,endTime:patternsFixture[5].endTime,workPattern:patternsFixture[5]};}
 if(index>8)practiceAction('shortage');
 if(index>10)practice.answered=true;
 if(index>11){practice.answered=true;practice.generated=true;practice.shortage=true;practiceAction('reevaluate');}
 if(index>14)practice.eligible=true;
 if(index>15)db.status='CONFIRMED';
}
export function practiceAction(action:string){
 if(!practice.active||role!=='ADMIN')throw new Error('管理者の実践編で操作してください。');
 if(action==='shortage'){if(!practice.generated)throw new Error('下書きを先に作成してください。');db.assignmentEdits[`${staffFixture[1].id}:${month}-15`]={shiftType:'NORMAL',startTime:patternsFixture[4].startTime,endTime:patternsFixture[4].endTime,workPattern:patternsFixture[4]};practice.shortage=true;practice.evaluated=false;practice.eligible=false;db.status='DRAFT';}
 if(action==='answer'){if(!practice.shortage)throw new Error('確認事項を確認してください。');practice.answered=true;practice.evaluated=false;practice.eligible=false;}
 if(action==='reevaluate'){if(!practice.answered)throw new Error('回答を先に記録してください。');db.assignmentEdits[`${staffFixture[1].id}:${month}-15`]={shiftType:'NORMAL',startTime:patternsFixture[5].startTime,endTime:patternsFixture[5].endTime,workPattern:patternsFixture[5],workPatternId:patternsFixture[5].id};practice.shortage=assignments(month).filter((a:any)=>a.workDate===`${month}-15`&&a.workPattern?.code==='⑥').length<1;practice.evaluated=true;}
 if(action==='eligible'){if(!practice.generated||practice.shortage||!practice.answered||!practice.evaluated)throw new Error('不足または未確認の項目があります。');practice.eligible=true;}
 return practiceState();
}
export function reviewFixture():SetupState{return {id:'practice-only',name:'練習用の園',code:null,phone:null,postalCode:null,prefecture:null,city:null,addressLine:null,contactName:null,contactEmail:null,timezone:'Asia/Tokyo',setupStatus:'COMPLETED',setupCurrentStep:5,setupCompletedAt:stamp,termsAcceptedAt:stamp,privacyAcceptedAt:stamp,termsVersion:'practice',privacyVersion:'practice',tenant:{id:'practice-only',name:'練習用の園',code:null},workforceSetupState:'COMPLETE',preserveWorkforceSetup:true,shiftSettings:clone(db.settings),activeStaffCount:4,currentTermsVersion:'practice',currentPrivacyVersion:'practice',termsVersionCurrent:true,privacyVersionCurrent:true,canComplete:true,missingRequirements:[],classRequirements:clone(db.classes),workforceReview:{digest:'practice',workConfirmed:true,staffConfirmed:true,fiscalYearStartMonth:4,staffCount:4,generatorCount:3,excludedCount:1,fixedAttributeCount:2,patterns:clone(patternsFixture),requirements:[],rules:[2,3].map(i=>({ruleType:'FIXED_WORK_PATTERN',workPattern:{code:patternsFixture[4].code,name:i===2?'子育て支援':'給食'},dayOfWeek:null,startDate:null,endDate:null,startTime:'09:00',endTime:'18:00',numericValue:null,isHardConstraint:true,staffCount:1})),departments:[{name:'保育',staffCount:2,fixedCount:0,excludedCount:0},{name:'子育て支援',staffCount:1,fixedCount:1,excludedCount:0},{name:'給食',staffCount:1,fixedCount:1,excludedCount:1}]}};}

export function trainingRole(next:'ADMIN'|'STAFF'){role=next;}
export function prepareSwapExercise(){db.swaps=[];const date=`${month}-21`;db.assignmentEdits={...db.assignmentEdits,[`${staffFixture[1].id}:${date}`]:{shiftType:'NORMAL',startTime:'07:00',endTime:'16:00',workPattern:patternsFixture[0]}};}
