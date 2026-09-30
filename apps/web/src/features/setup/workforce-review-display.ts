import type { WorkforceReview } from '../../api/client';

// Presentation only: preserve identities, requirement strength, counts and periods.
export function dayLabel(values: Array<number | null>): string {
 const ordered = [...new Set(values.filter((x): x is number => x !== null))].sort((a,b)=>(a===0?7:a)-(b===0?7:b));
 const labels=['日','月','火','水','木','金','土']; const parts:string[]=[];
 for(let i=0;i<ordered.length;i++) { let j=i; while(j+1<ordered.length && (ordered[j+1]===0?7:ordered[j+1])===(ordered[j]===0?7:ordered[j])+1) j++;
 parts.push(j===i?`${labels[ordered[i]]}曜日`:`${labels[ordered[i]]}〜${labels[ordered[j]]}`); i=j; }
 if(values.includes(null)) parts.push('曜日指定なし');
 return parts.join('・') || '曜日設定なし';
}
export function groupDays<T extends {dayOfWeek:number|null}>(rows:T[]):Array<{row:Omit<T,'dayOfWeek'>;days:Array<number|null>}> {
 const groups:Array<{key:string;row:Omit<T,'dayOfWeek'>;days:Array<number|null>}>=[];
 for(const {dayOfWeek,...row} of rows){const key=JSON.stringify([row,dayOfWeek===null]);const found=groups.find(g=>g.key===key&&!g.days.includes(dayOfWeek));if(found)found.days.push(dayOfWeek);else groups.push({key,row,days:[dayOfWeek]});}
 return groups.map(({row,days})=>({row,days}));
}
export function displayPatterns(patterns:WorkforceReview['patterns']) {
 const names=['普通出','普通出（土曜日）','①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
 const rank=(name:string)=>{const i=names.indexOf(name==='普通出（土曜）'?'普通出（土曜日）':name);return i<0?names.length:i;};
 return patterns.map((p,index)=>({p,index})).sort((a,b)=>rank(a.p.name)-rank(b.p.name)||a.index-b.index).map(({p})=>p);
}
export function patternDays(code:string,requirements:WorkforceReview['requirements']) {
 // Required staffing dates are evidence, not a declaration of every employee's availability.
 return groupDays(requirements.filter(r=>r.workPattern?.code===code));
}
