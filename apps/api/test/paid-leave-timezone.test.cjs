const assert = require('node:assert/strict');
const { businessDateAt } = require('../dist/presentation/paid-leave/paid-leave.service.js');

for (const [instant, expected] of [
  ['2030-01-06T15:00:00.000Z', '2030-01-07'], // 00:00 JST
  ['2030-01-06T16:00:00.000Z', '2030-01-07'], // 01:00 JST
  ['2030-01-06T23:59:00.000Z', '2030-01-07'], // 08:59 JST
  ['2030-01-07T00:00:00.000Z', '2030-01-07'], // 09:00 JST
]) assert.equal(businessDateAt(new Date(instant), 'Asia/Tokyo'), expected, instant);

assert.equal(businessDateAt(new Date('2030-01-07T04:30:00.000Z'), 'America/New_York'), '2030-01-06');
assert.throws(() => businessDateAt(new Date(), 'Invalid/Timezone'), RangeError);
console.log('Paid leave tenant timezone tests: PASS (JST 00:00/01:00/08:59/09:00, New York, invalid timezone)');
