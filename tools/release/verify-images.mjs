import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { metadataLabels, validateMetadata } from '../../apps/web/release-metadata.mjs';
const manifest=JSON.parse(readFileSync(process.argv[2],'utf8'));
const metadata=validateMetadata(manifest.metadata);
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8'});
for (const [app,artifact] of Object.entries(manifest.images)) {
 const [image]=JSON.parse(docker(['image','inspect',artifact.imageId]));
 for(const [key,value] of Object.entries(metadataLabels(metadata))) assert.equal(image.Config.Labels[key],value);
 assert.equal(image.Architecture,'amd64');
 if(app==='web') {
  const raw=docker(['run','--rm','--network','none','--entrypoint','cat',artifact.imageId,'/usr/share/nginx/html/release-metadata.json']);
  assert.deepEqual(JSON.parse(raw),metadata);
  const js=docker(['run','--rm','--network','none','--entrypoint','sh',artifact.imageId,'-c','cat /usr/share/nginx/html/assets/*.js']);
  for(const value of Object.values(metadata)) assert.ok(js.includes(value), 'Bundle metadata mismatch');
  assert.ok(!js.includes('20260723.11A-RC1'));
  assert.doesNotMatch(js,/DATABASE_URL|JWT_SECRET|BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY/);
  assert.equal(docker(['run','--rm','--network','none','--entrypoint','find',artifact.imageId,'/usr/share/nginx/html','-name','*.map']).trim(),'');
 }
}
console.log('Manifest / image labels / Web JSON / bundle metadata match; source map 0; Web secret identifiers 0');
