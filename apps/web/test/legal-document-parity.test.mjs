import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['../src/features/legal/legal-documents.ts','../../api/src/presentation/setup/legal-documents.ts'];
const values=await Promise.all(files.map(async f=>JSON.parse((await readFile(new URL(f,import.meta.url),'utf8')).split('export const LEGAL_DOCUMENTS = ')[1].replace(/ as const;\s*$/,''))));
assert.deepEqual(values[0],values[1]);
const doc=values[0];
for(const type of ['terms','privacy']){const {contentHash,...data}=doc[type];assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),contentHash);assert.ok(data.sections.length>=12);assert.ok(!data.version.includes('draft'));}
if(doc.release.approved){assert.match(doc.release.effectiveDate,/^\d{4}-\d{2}-\d{2}$/);assert.ok(doc.release.contact);assert.ok(!JSON.stringify(doc).includes('要確認'));}
else assert.equal(doc.release.effectiveDate,null);
console.log('LEGAL_DOCUMENT_PARITY_PASS immutable content identifiers and approval prerequisites');
