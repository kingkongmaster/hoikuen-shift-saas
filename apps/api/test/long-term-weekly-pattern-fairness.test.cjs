const assert = require('node:assert/strict');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const month = new Date('2026-09-01T00:00:00Z');
const member = (id, annualFairness) => ({ id,employeeNumber:id,displayName:id,assignedClass:'FREE',employmentType:'FULL_TIME',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true,monthlyWorkHourLimit:300,weeklyAvailableDays:7,...(annualFairness?{annualFairness}:{}) });
const pattern = { id:'p03',code:'03',startTime:'09:00',endTime:'17:30',breakMinutes:60,isWorking:true,countsTowardStaffing:true,isActive:true };
const prior = (staffId,date,workPatternId='p01',shiftType='OTHER') => ({staffId,workDate:new Date(`${date}T00:00:00Z`),shiftType,workPatternId});
const normal = (staffId,date) => prior(staffId,date,'normal','NORMAL');
const attr = (staffId) => ({staffId,attributeDefinitionId:'eligible',startDate:null,endDate:null});
const requirement = {id:'required',code:'LONG_FAIRNESS',name:'長期公平性',attributeDefinitionId:'eligible',workPatternId:'p03',workPattern:pattern,classType:null,dayOfWeek:null,startDate:month,endDate:month,requiredCount:1,constraintLevel:'HARD'};
const options = {weekdayEarlyRequired:0,weekdayLateRequired:0,saturdayEarlyRequired:0,saturdayLateRequired:0,saturdayMinimumStaff:0,saturdayOperationEnabled:true,sundayOperationEnabled:false,maxConsecutiveWorkDays:31,maxConsecutiveEarlyDays:31,maxConsecutiveLateDays:31,defaultStartEarly:'07:30',defaultEndEarly:'16:00',defaultStartNormal:'08:30',defaultEndNormal:'17:00',defaultStartLate:'11:00',defaultEndLate:'19:30',defaultBreakMinutes:60,classRequirements:[],weeklyPatternGroups:[{groupCode:'GROUP',maxPerWeek:1,workPatternIds:['p01','p03']}],weeklyPatternRelaxation:{enabled:true,maxPerWeek:2,historyYears:3,recentWindowDays:90,formalStatus:'FORMAL'},fairnessWindows:{recentStart:new Date('2026-06-03T00:00:00Z'),fiscalStart:new Date('2026-04-01T00:00:00Z'),longTermStart:new Date('2023-09-01T00:00:00Z')},systemWorkPatternIds:{EARLY:'early',NORMAL:'normal',LATE:'late'},replaceLegacyShiftTargetsWhenPatternRequirementsActive:true,staffingRequirements:[requirement]};
const run = (staff, history) => generateRuleBasedSchedule(month,staff,[],{...options,priorAssignments:history,staffAttributeAssignments:staff.map(row=>attr(row.id))});
const selected = (result) => result.weeklyPatternRelaxations[0]?.staffId;
const current = (ids) => ids.map(id=>prior(id,'2026-08-31'));
const repeatedWeek = (id,monday) => { const next=new Date(`${monday}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);return[prior(id,monday),prior(id,next.toISOString().slice(0,10))]; };

// A: with equal recent load, lower two-to-three-year repeated-week burden wins.
const aHistory=[...repeatedWeek('A','2024-10-07'),...repeatedWeek('A','2024-11-04'),...current(['A','B'])];
assert.equal(selected(run([member('A'),member('B')],aHistory)),'B','A: 長期の週2回負担が少ないBを優先');

// B: recent concentration is considered before the long-term advantage.
const bHistory=[...repeatedWeek('A','2024-10-07'),...repeatedWeek('A','2024-11-04'),...repeatedWeek('B','2026-07-06'),...current(['A','B'])];
assert.equal(selected(run([member('A'),member('B')],bHistory)),'A','B: 直近で集中したBへ単純に再集中させない');

// C: normalize long-term totals by observed working-opportunity weeks.
const opportunities=[];for(let i=0;i<80;i++){const d=new Date('2024-01-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i*7);opportunities.push(normal('A',d.toISOString().slice(0,10)));}
const cHistory=[...opportunities,...repeatedWeek('A','2024-02-05'),...repeatedWeek('A','2024-04-01'),...repeatedWeek('A','2024-06-03'),...repeatedWeek('A','2024-08-05'),normal('B','2025-01-06'),...repeatedWeek('B','2025-01-13'),...current(['A','B'])];
assert.equal(selected(run([member('A'),member('B')],cHistory)),'A','C: 途中入職相当は単純合計でなく機会週率を使う');

// D: generator state is call-local; another tenant/call receives no foreign history.
run([member('TENANT-A')],[...repeatedWeek('TENANT-A','2024-10-07'),...current(['TENANT-A'])]);
const tenantB=run([member('TENANT-B')],current(['TENANT-B']));
assert.equal(tenantB.weeklyPatternRelaxations[0].longTermRelaxedWeekCountBefore,0,'D: Tenant A相当の履歴はTenant B相当へ混入しない');

// E: with no usable long-term opportunity difference, existing annual fairness remains the fallback.
const eResult=run([member('E-A',{annualTargetMinutes:10000,confirmedFairnessMinutes:9000}),member('E-B',{annualTargetMinutes:10000,confirmedFairnessMinutes:1000})],current(['E-A','E-B']));
assert.equal(selected(eResult),'E-B','E: 履歴不足時は既存年間公平性へフォールバック');

// F: assignments older than the configured three-year window are ignored.
const fHistory=[...repeatedWeek('F-A','2023-08-07'),...current(['F-A','F-B'])];
const fResult=run([member('F-A',{annualTargetMinutes:10000,confirmedFairnessMinutes:1000}),member('F-B',{annualTargetMinutes:10000,confirmedFairnessMinutes:9000})],fHistory);
assert.equal(selected(fResult),'F-A','F: 3年以上前の負担を選考へ混入しない');
assert.equal(fResult.weeklyPatternRelaxations[0].longTermRelaxedWeekCountBefore,0);

console.log('Long-term weekly-pattern fairness: PASS (A-F; recent/fiscal/3-year/opportunity normalization/isolation/fallback)');
