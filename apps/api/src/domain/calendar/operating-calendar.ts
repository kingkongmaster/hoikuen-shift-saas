import { japanHolidays, holidayYears } from './japan-holidays';
export const calendarExceptionType = 'CALENDAR_DAY';
type Closed = { closedDate: Date; name: string };
type Exception = { id: string; exceptionDate: Date; configuration: unknown; reason: string; sourceType: string; confirmedAt: Date | null; confirmedBy: string | null };
export function operatingCalendar(month: string, closed: Closed[], exceptions: Exception[], setting: { saturdayOperationEnabled?: boolean } | null) {
  const year = Number(month.slice(0,4)), covered = year >= holidayYears.first && year <= holidayYears.last;
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth()+1);
  const closedByDate = new Map(closed.map(row=>[row.closedDate.toISOString().slice(0,10),row.name]));
  const overrides = exceptions.map(row=>({id:row.id,date:row.exceptionDate.toISOString().slice(0,10),state:(row.configuration as {state?:string}|null)?.state,reason:row.reason,valid:row.sourceType==='ADMIN_CONFIRMED'&&!!row.confirmedAt&&!!row.confirmedBy&&!!row.reason.trim()}));
  const days=[];
  for(let day=new Date(`${month}-01T00:00:00Z`);day<end;day.setUTCDate(day.getUTCDate()+1)){
    const date=day.toISOString().slice(0,10),holidayName=japanHolidays[date]??null,override=overrides.find(row=>row.date===date),manual=closedByDate.get(date);
    const validOverride=override?.valid&&(override.state==='OPEN'||override.state==='CLOSED');
    const reason=validOverride?override.reason:manual??holidayName??(day.getUTCDay()===0?'日曜日':day.getUTCDay()===6&&setting?.saturdayOperationEnabled===false?'土曜休園設定':'通常開園');
    const isOpen=validOverride?override.state==='OPEN':!manual&&!holidayName&&day.getUTCDay()!==0&&!(day.getUTCDay()===6&&setting?.saturdayOperationEnabled===false);
    days.push({date,isOpen,holidayName,reason,source:validOverride?'OVERRIDE':manual?'TENANT_CLOSED':holidayName?'JAPAN_HOLIDAY':day.getUTCDay()===0?'SUNDAY':'WEEKDAY',invalidOverride:!!override&&!validOverride});
  }
  return {month,holidayCoverage:covered,verifiedThroughYear:holidayYears.last,days,overrides};
}
export async function readOperatingCalendar(db: any, tenantId: string, month: string) {
  const start=new Date(`${month}-01T00:00:00Z`),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
  const [closed,exceptions,setting]=await Promise.all([
    db.tenantClosedDate.findMany({where:{tenantId,closedDate:{gte:start,lt:end}}}),
    db.tenantRuleException.findMany({where:{tenantId,exceptionType:calendarExceptionType,isActive:true,exceptionDate:{gte:start,lt:end}}}),
    db.tenantShiftSetting.findUnique({where:{tenantId}}),
  ]);
  return operatingCalendar(month,closed,exceptions,setting);
}
export function effectiveClosedDates(calendar: ReturnType<typeof operatingCalendar>) {
  return calendar.days.filter(day=>!day.isOpen).map(day=>({id:`calendar:${day.date}`,closedDate:new Date(`${day.date}T00:00:00Z`),name:day.reason,createdAt:new Date(0),updatedAt:new Date(0),tenantId:'',note:null}));
}
