import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [installer, page, release, workflow] = await Promise.all([
  readFile(new URL('../installer/AeNShift.iss', import.meta.url), 'utf8'),
  readFile(new URL('../../download-page/index.template.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/release-info.txt', import.meta.url), 'utf8'),
  readFile(new URL('../../../.github/workflows/windows-distribution.yml', import.meta.url), 'utf8'),
]);

assert.match(installer, /AppVersion "1\.0\.0-musubi\.1"/);
assert.match(installer, /PrivilegesRequired=lowest/);
assert.match(installer, /Filename: "\{#SaaSUrl\}"/);
assert.match(installer, /https:\/\//);
assert.match(installer, /\{uninstallexe\}/);
assert.match(installer, /desktopicon/);
assert.doesNotMatch(installer, /DATABASE_URL|postgres(?:ql)?:\/\/|JWT_SECRET|password\s*=/i);
assert.doesNotMatch(`${page}\n${release}`, /DATABASE_URL|postgres(?:ql)?:\/\/|JWT_SECRET|github[_ -]?token|ChangeMe123/i);
assert.match(page, /noindex,nofollow,noarchive/);
assert.match(page, /AeN-Shift-Release-1-Musubi-Trial\.exe/);
assert.match(page, /AeNShift\.ico/);
assert.match(page, /__INSTALLER_SHA256__/);
assert.match(page, /Windows 11（64-bit）推奨/);
assert.match(page, /アンインストール/);
assert.match(workflow, /windows-latest/);
assert.match(workflow, /SaaS URL must use HTTPS/);
assert.match(workflow, /Get-FileHash/);
assert.match(workflow, /upload-artifact/);
assert.doesNotMatch(workflow, /DATABASE_URL|JWT_SECRET|POSTGRES_PASSWORD/);

console.log('Windows distribution structure and secret-boundary tests: PASS');
