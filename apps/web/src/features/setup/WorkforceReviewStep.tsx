import { dayLabel, displayPatterns, displayRequirements, groupDays, patternDays } from './workforce-review-display';
import type { SetupState } from '../../api/client';
const classes: Record<string,string> = {AGE_0:'0歳',AGE_1:'1歳',AGE_2:'2歳',AGE_3:'3歳',AGE_4:'4歳',AGE_5:'5歳',FREE:'フリー'};
const labels: Record<string,string> = {FIXED_WORK_PATTERN:'固定勤務',AVAILABLE_WORK_PATTERN:'勤務候補',UNAVAILABLE_WORK_PATTERN:'勤務対象外',AVAILABLE_DAY_OF_WEEK:'勤務候補曜日',UNAVAILABLE_DAY_OF_WEEK:'勤務不可曜日',REQUIRED_DAY_OFF:'休み指定',AVAILABLE_TIME_RANGE:'勤務可能時間帯',UNAVAILABLE_TIME_RANGE:'勤務不可時間帯',PREFERRED_WORK_PATTERN:'希望勤務',MAX_WORK_DAYS_PER_WEEK:'週の勤務日数上限',MAX_WORK_DAYS_PER_MONTH:'月の勤務日数上限',MIN_WORK_DAYS_PER_MONTH:'月の勤務日数下限',MAX_WORK_PATTERN_PER_MONTH:'月の勤務回数上限',MAX_WORK_MINUTES_PER_MONTH:'月の勤務分数上限',MIN_WORK_MINUTES_PER_MONTH:'月の勤務分数下限',MAX_CONSECUTIVE_WORK_DAYS:'連続勤務日数上限'};
function period(a:string|null,b:string|null){return a||b ? `適用期間 ${a?.slice(0,10)??'開始指定なし'}〜${b?.slice(0,10)??'終了指定なし'}`:'期間指定なし';}
export function WorkforceReviewStep({setup,step}:{setup:SetupState;step:number}){
 const r=setup.workforceReview!;
 const requirements=groupDays(displayRequirements(r.requirements));
 const ruleSections=[

  {title:'曜日条件',rows:r.rules.filter(x=>x.ruleType!=='FIXED_WORK_PATTERN'&&x.dayOfWeek!==null)},
  {title:'期間条件',rows:r.rules.filter(x=>x.ruleType!=='FIXED_WORK_PATTERN'&&x.dayOfWeek===null&&(x.startDate||x.endDate))},
  {title:'配置上の重要ルール',rows:r.rules.filter(x=>x.ruleType!=='FIXED_WORK_PATTERN'&&x.dayOfWeek===null&&!x.startDate&&!x.endDate)},
 ];
 return <section aria-label={step===2?'勤務設定の確認':'職員・クラス設定の確認'} className="space-y-5 break-words text-base leading-7">
 <h2 className="text-xl font-bold">{step===2?'勤務設定をご確認ください':'職員・クラス設定をご確認ください'}</h2>
 <p>登録済みの設定です。この画面は確認専用で、勤務・職員・クラスのデータは変更しません。</p>
 {step===2?<>
 <p className="rounded border bg-slate-50 p-3">年度開始月：{r.fiscalYearStartMonth}月</p>
 <h3 className="font-bold">勤務パターン・勤務時間・対象曜日</h3>
 <p className="text-sm text-slate-600">曜日は登録済みの必要人数設定から表示しています。「資料上の分類」は正式資料に基づく確認用表示で、職員の勤務可否やDBの曜日制約を表すものではありません。個別の曜日・期間条件は下でご確認ください。</p>
 <ul aria-label="勤務パターン一覧" className="grid gap-3 sm:grid-cols-2">{displayPatterns(r.patterns).map(x=>{
 const conditions=patternDays(x.code,r.requirements);
 const sourceScope=r.sourceDayScopes?.find(s=>s.code===x.code&&s.basis==='SOURCE_REVIEW_ONLY');
 const periods=new Map<string,{startDate:string|null;endDate:string|null;days:Array<number|null>}>();
 for(const c of conditions){const key=JSON.stringify([c.row.startDate,c.row.endDate]);const value=periods.get(key)??{startDate:c.row.startDate,endDate:c.row.endDate,days:[]};value.days.push(...c.days);periods.set(key,value);}
 return <li key={x.code} className="rounded-xl border border-slate-300 bg-white p-4"><strong className="text-lg">{x.name}</strong><p>{x.isWorking?`${x.startTime??'未設定'}〜${x.endTime??'未設定'}`:'非勤務'}{periods.size===0&&!sourceScope?' ｜ 曜日設定なし':''}</p>{sourceScope&&<p>{dayLabel(sourceScope.days)}{sourceScope.exclusive?'限定':''} <span className="text-sm text-slate-600">（資料上の分類）</span></p>}{[...periods].map(([key,c])=><p key={key}>{dayLabel(c.days)}{c.startDate||c.endDate?` / ${period(c.startDate,c.endDate)}`:''}</p>)}</li>;
 })}</ul>
 <details open className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-bold">必要人数</summary><ul className="space-y-3">{requirements.map(({row:x,days},i)=><li key={i} className="border-t pt-3"><strong>{x.workPattern?.name??'勤務全体'}：{x.requiredCount}名</strong><p>{x.attributeDefinition.name} / {dayLabel(days)}{x.classType?` / ${classes[x.classType]??x.classType}`:''}</p><p>{x.constraintLevel==='HARD'?'必須条件':x.constraintLevel==='SOFT'?'優先条件':'参考条件'} / {period(x.startDate,x.endDate)}</p></li>)}</ul></details>
 <details open className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-bold">固定勤務</summary><ul className="space-y-3">{(r.fixedRuleGroups??r.rules.filter(x=>x.ruleType==='FIXED_WORK_PATTERN').map(({dayOfWeek,staffCount,...rule})=>({rule,days:[dayOfWeek],staffCount}))).map(({rule:x,days,staffCount},i)=><li key={i} className="border-t pt-3"><strong>{x.workPattern?.name?`${x.workPattern.name} `:''}固定勤務：{staffCount}名</strong><p>{dayLabel(days)} {x.startTime||x.endTime?`${x.startTime??'指定なし'}〜${x.endTime??'指定なし'}`:''}{x.numericValue!==null?` / 設定値 ${x.numericValue}`:''}</p><p>{x.isHardConstraint?'必須条件':'優先条件'} / {period(x.startDate,x.endDate)}</p></li>)}</ul></details>
 <p>以下は同じ条件の対象人数です。別条件の人数は合算せず、氏名・個人IDは表示しません。</p>
 {ruleSections.map(section=><details key={section.title} open className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-bold">{section.title}</summary>{section.rows.length===0?<p>該当する登録条件はありません。</p>:<ul className="space-y-3">{section.rows.map((x,i)=><li key={i} className="border-t pt-3"><strong>{x.workPattern?.name?`${x.workPattern.name} `:''}{labels[x.ruleType]??'勤務条件'}：対象{x.staffCount}名</strong><p>{dayLabel([x.dayOfWeek])} {x.startTime||x.endTime?`${x.startTime??'指定なし'}〜${x.endTime??'指定なし'}`:''}{x.numericValue!==null?` / 設定値 ${x.numericValue}`:''}</p><p>{x.isHardConstraint?'必須条件':'優先条件'} / {period(x.startDate,x.endDate)}</p></li>)}</ul>}</details>)}
 </>:<>
 <dl className="grid gap-3 sm:grid-cols-2">{[['職員',r.staffCount],['シフト生成対象',r.generatorCount],['自動生成から除外',r.excludedCount],['固定勤務属性',r.fixedAttributeCount]].map(([label,n])=><div key={label} className="rounded border bg-slate-50 p-3"><dt>{label}</dt><dd className="text-xl font-bold">{n}名</dd></div>)}</dl>
 <p>登録済みの除外・固定属性に基づく人数です。日別の勤務可否は曜日・期間・休暇等の条件でも変わります。</p>
 <h3 className="font-bold">部署構成</h3><ul className="space-y-2">{r.departments.map((x,i)=><li key={i} className="rounded border p-3">{x.name}：{x.staffCount}名（固定{x.fixedCount}名・生成対象外{x.excludedCount}名）</li>)}</ul>
 <h3 className="font-bold">クラス構成・必要人数</h3><ul className="space-y-2">{setup.classRequirements.filter(x=>x.isActive).map(x=><li key={x.classType} className="rounded border p-3">{classes[x.classType]??x.classType}：平日{x.weekdayRequired}名 / 土曜{x.saturdayRequired}名</li>)}</ul>
 <p>個人別の詳細は、初期設定完了後に管理者の職員・勤務条件画面で確認できます。ここでは氏名一覧を表示しません。</p>
 </>}
 </section>;
}
