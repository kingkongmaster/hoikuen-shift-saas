import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
function files(dir) { return readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(resolve(dir,e.name)) : [resolve(dir,e.name)]); }
for (const file of files(resolve(root,'apps/api/src'))) {
  assert.doesNotMatch(readFileSync(file,'utf8'), /FileInterceptor|FilesInterceptor|FileFieldsInterceptor|AnyFilesInterceptor|MulterModule|from\s+['"]multer['"]|require\(['"]multer['"]\)|multipart\/form-data|createQuic|node:quic/, `Reassess conditional vulnerabilities: ${file}`);
}
const nginx=readFileSync(resolve(root,'apps/web/nginx.conf'),'utf8');
assert.doesNotMatch(nginx,/load_module|image_filter|xslt_stylesheet|ssl_certificate|\bquic\b|\bhttp2\b/);
for (const app of ['api','web']) {
 const dockerfile=readFileSync(resolve(root,`apps/${app}/Dockerfile`),'utf8');
 for (const line of dockerfile.split('\n').filter(l=>l.startsWith('FROM ') && !l.startsWith('FROM scratch'))) assert.match(line,/@sha256:[a-f0-9]{64}/);
}
console.log('Image conditional exposure boundaries PASS (static scope)');
