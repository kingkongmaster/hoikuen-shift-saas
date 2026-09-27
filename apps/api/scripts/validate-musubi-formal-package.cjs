const { readFormalPackage } = require('./lib/formal-package-file.cjs');
const { adaptFormalPackage } = require('./lib/formal-package-adapter.cjs');
try {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: validate-musubi-formal-package.cjs <Git-external.json> <admin anonymous ID>');
  const { bytes, checksum } = readFormalPackage(file);
  const result = adaptFormalPackage(JSON.parse(bytes.toString('utf8')), { adminEmployeeNumber: process.argv[3] });
  console.log(JSON.stringify({ pass: true, checksum, staff: result.staff.length, generatorEligible: result.staff.filter(row => row.generatorEligible).length,
    sourceId: result.formalSourceProvenance.matrixSourceId, productionUseApproved: result.productionUseApproved, writes: 0 }));
} catch (error) {
  console.error(error.message?.startsWith('SYSTEM_SAFETY_BLOCK:') ? error.message : 'SYSTEM_SAFETY_BLOCK:FORMAL_PACKAGE_VALIDATION_FAILED'); process.exitCode = 1;
}
