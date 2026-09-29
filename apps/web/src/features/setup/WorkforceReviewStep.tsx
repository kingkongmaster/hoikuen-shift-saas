import type { SetupState } from '../../api/client';
const days = ['日', '月', '火', '水', '木', '金', '土'];
const day = (v: number | null) => v === null ? '曜日指定なし' : `${days[v]}曜日`;
const classes: Record<string,string> = {AGE_0:'0歳',AGE_1:'1歳',AGE_2:'2歳',AGE_3:'3歳',AGE_4:'4歳',AGE_5:'5歳',FREE:'フリー'};
const labels: Record<string,string> = {FIXED_WORK_PATTERN:'固定勤務',AVAILABLE_WORK_PATTERN:'勤務候補',UNAVAILABLE_WORK_PATTERN:'勤務対象外',AVAILABLE_DAY_OF_WEEK:'勤務候補曜日',UNAVAILABLE_DAY_OF_WEEK:'勤務不可曜日',REQUIRED_DAY_OFF:'休み指定',AVAILABLE_TIME_RANGE:'勤務可能時間帯',UNAVAILABLE_TIME_RANGE:'勤務不可時間帯',PREFERRED_WORK_PATTERN:'希望勤務',MAX_WORK_DAYS_PER_WEEK:'週の勤務日数上限',MAX_WORK_DAYS_PER_MONTH:'月の勤務日数上限',MIN_WORK_DAYS_PER_MONTH:'月の勤務日数下限',MAX_WORK_PATTERN_PER_MONTH:'月の勤務回数上限',MAX_WORK_MINUTES_PER_MONTH:'月の勤務分数上限',MIN_WORK_MINUTES_PER_MONTH:'月の勤務分数下限',MAX_CONSECUTIVE_WORK_DAYS:'連続勤務日数上限'};
function period(a:string|null,b:string|null){return a||b ? `適用期間 ${a?.slice(0,10)??'開始指定なし'}〜${b?.slice(0,10)??'終了指定なし'}`:'期間指定なし';}
export function WorkforceReviewStep({setup,step}:{setup:SetupState;step:number}){
 const r=setup.workforceReview!;
 return <section aria-label={step===2?'勤務設定の確認':'職員・クラス設定の確認'} className="space-y-5 break-words text-base leading-7">
 <h2 className="text-xl font-bold">{step===2?'勤務設定をご確認ください':'職員・クラス設定をご確認ください'}</h2>
 <p>登録済みの設定です。この画面は確認専用で、勤務・職員・クラスのデータは変更しません。</p>
 {step===2?<>
 <p className="rounded border bg-slate-50 p-3">年度開始月：{r.fiscalYearStartMonth}月</p>
 <h3 className="font-bold">勤務パターン・勤務時間</h3><ul className="grid gap-3 sm:grid-cols-2">{r.patterns.map(x=><li key={x.code} className="rounded border p-3"><strong>{x.name}</strong><p>{x.isWorking?`${x.startTime??'未設定'}〜${x.endTime??'未設定'}`:'非勤務'}</p></li>)}</ul>
 <details open className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-bold">曜日別の必要人数</summary><ul className="space-y-3">{r.requirements.map((x,i)=><li key={i} className="border-t pt-3"><strong>{x.workPattern?.name??'勤務全体'}：{x.requiredCount}名</strong><p>{x.attributeDefinition.name} / {day(x.dayOfWeek)}{x.classType?` / ${classes[x.classType]??x.classType}`:''}</p><p>{x.constraintLevel==='HARD'?'必須条件':x.constraintLevel==='SOFT'?'優先条件':'参考条件'} / {period(x.startDate,x.endDate)}</p></li>)}</ul></details>
 <details open className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-bold">固定勤務・曜日・個別条件の概要</summary><p>同じ設定の対象人数を表示しています。氏名や個人の理由は表示しません。</p><ul className="space-y-3">{r.rules.map((x,i)=><li key={i} className="border-t pt-3"><strong>{labels[x.ruleType]??'勤務条件'}：対象{x.staffCount}名</strong><p>{x.workPattern?.name??''} {day(x.dayOfWeek)} {x.startTime||x.endTime?`${x.startTime??'指定なし'}〜${x.endTime??'指定なし'}`:''}{x.numericValue!==null?` / 設定値 ${x.numericValue}`:''}</p><p>{x.isHardConstraint?'必須条件':'優先条件'} / {period(x.startDate,x.endDate)}</p></li>)}</ul></details>
 </>:<>
 <dl className="grid gap-3 sm:grid-cols-2">{[['職員',r.staffCount],['シフト生成対象',r.generatorCount],['自動生成から除外',r.excludedCount],['固定勤務属性',r.fixedAttributeCount]].map(([label,n])=><div key={label} className="rounded border bg-slate-50 p-3"><dt>{label}</dt><dd className="text-xl font-bold">{n}名</dd></div>)}</dl>
 <p>登録済みの除外・固定属性に基づく人数です。日別の勤務可否は曜日・期間・休暇等の条件でも変わります。</p>
 <h3 className="font-bold">部署構成</h3><ul className="space-y-2">{r.departments.map((x,i)=><li key={i} className="rounded border p-3">{x.name}：{x.staffCount}名（固定{x.fixedCount}名・生成対象外{x.excludedCount}名）</li>)}</ul>
 <h3 className="font-bold">クラス構成・必要人数</h3><ul className="space-y-2">{setup.classRequirements.filter(x=>x.isActive).map(x=><li key={x.classType} className="rounded border p-3">{classes[x.classType]??x.classType}：平日{x.weekdayRequired}名 / 土曜{x.saturdayRequired}名</li>)}</ul>
 <p>個人別の詳細は、初期設定完了後に管理者の職員・勤務条件画面で確認できます。ここでは氏名一覧を表示しません。</p>
 </>}
 </section>;
}
