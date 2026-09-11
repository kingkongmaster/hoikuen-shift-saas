const assert = require('node:assert/strict');
const { materializeFixedAssignments } = require('../dist/application/shifts/fixed-assignment-materializer');

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-10-01T00:00:00.000Z');
const rows = materializeFixedAssignments({
  staff: [{ id: 'fixed-1', regularWorkStartTime: '08:45', regularWorkEndTime: '17:15' }],
  requests: [
    { id: 'leave', staffId: 'fixed-1', requestDate: new Date('2026-09-02T00:00:00.000Z'), requestType: 'PAID_LEAVE' },
    { id: 'half', staffId: 'fixed-1', requestDate: new Date('2026-09-03T00:00:00.000Z'), requestType: 'HALF_DAY_PM' },
  ],
  start,
  end,
  closedDates: [new Date('2026-09-22T00:00:00.000Z')],
  sundayOperationEnabled: false,
  defaultBreakMinutes: 60,
});

assert.equal(rows.length, 30);
assert.equal(new Set(rows.map((row) => `${row.staffId}:${row.workDate.toISOString().slice(0, 10)}`)).size, 30);
assert.equal(rows.find((row) => row.workDate.toISOString().startsWith('2026-09-01')).shiftType, 'OTHER');
assert.equal(rows.find((row) => row.workDate.toISOString().startsWith('2026-09-02')).shiftType, 'PAID_LEAVE');
assert.equal(rows.find((row) => row.workDate.toISOString().startsWith('2026-09-03')).attendanceModifier.modifierType, 'PM_PAID_LEAVE');
assert.equal(rows.find((row) => row.workDate.toISOString().startsWith('2026-09-06')).shiftType, 'OFF');
assert.equal(rows.find((row) => row.workDate.toISOString().startsWith('2026-09-22')).note, '休園日');
assert.throws(() => materializeFixedAssignments({ staff: [{ id: 'bad', regularWorkStartTime: null, regularWorkEndTime: null }], requests: [], start, end, closedDates: [], sundayOperationEnabled: false, defaultBreakMinutes: 60 }));
console.log('Fixed assignment materializer tests: PASS');

const kitchen = ['k1','k2','k3'].map(id=>({id,regularWorkStartTime:'08:30',regularWorkEndTime:'17:00'}));
const kitchenRows=materializeFixedAssignments({staff:kitchen,requests:[],start:new Date('2035-01-01T00:00:00Z'),end:new Date('2035-02-01T00:00:00Z'),closedDates:[],sundayOperationEnabled:false,defaultBreakMinutes:60});
assert.equal(kitchenRows.length,3*31,'three anonymous fixed workers remain visible all month');
for(const id of kitchen.map(x=>x.id)) {
 const row=kitchenRows.find(x=>x.staffId===id&&x.workDate.toISOString().startsWith('2035-01-01'));
 assert.equal(row.startTime,'08:30');assert.equal(row.endTime,'17:00');assert.equal(row.assignedClass,null);
}
console.log('three anonymous fixed workers / no childcare class assignment PASS');
