const fs = require('node:fs');
const path = require('node:path');

const [output, tenantId] = process.argv.slice(2);
if (!output || !tenantId || !path.resolve(output).startsWith('/tmp/')) throw new Error('Usage: node test/create-musubi-import-rehearsal.cjs /tmp/file.json <tenant-uuid>');
const departments = (index) => index >= 20 ? ['FOOD_SERVICE', '給食室'] : index >= 18 ? ['CHILDCARE_SUPPORT', '子育て支援'] : ['CHILDCARE', '保育'];
const staff = Array.from({ length: 23 }, (_, index) => {
  const number = `S${String(index + 1).padStart(3, '0')}`;
  const [departmentCode, departmentName] = departments(index);
  const food = departmentCode === 'FOOD_SERVICE';
  const fixed = food ? [['07:30', '16:00'], ['08:30', '17:00'], ['08:00', '16:30']][index - 20] : null;
  return { employeeNumber: number, displayName: `非実名試験職員${number}`, employmentType: 'FULL_TIME', assignedClass: food ? 'FREE' : index >= 18 ? 'SUPPORT' : `AGE_${index % 6}`, canWorkEarly: !food, canWorkRegular: true, canWorkLate: !food, canWorkSaturdays: true, regularWorkStartTime: fixed?.[0] ?? null, regularWorkEndTime: fixed?.[1] ?? null, departmentCode, departmentName, generatorEligible: !food, isFoodService: food };
});
const input = { schemaVersion: 1, packageType: 'MUSUBI_BETA_STAFF_IMPORT', productionUseApproved: true, tenantId, expectedDisplayedStaff: 23, expectedGeneratorEligible: 20, expectedFoodService: 3, adminEmployeeNumber: 'S001', staff };
fs.writeFileSync(output, `${JSON.stringify(input, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log('Non-personal rehearsal package created outside Git.');
