const assert=require('node:assert/strict');
const {TechnicalJsonGuard}=require('../dist/infrastructure/auth/technical-json.guard');
const previous=process.env.RELEASE_CHANNEL;
try {
 process.env.RELEASE_CHANNEL='musubi-beta';
 assert.throws(()=>new TechnicalJsonGuard().canActivate(),e=>e.getStatus()===403);
 process.env.RELEASE_CHANNEL='standard';assert.equal(new TechnicalJsonGuard().canActivate(),true);
 delete process.env.RELEASE_CHANNEL;assert.equal(new TechnicalJsonGuard().canActivate(),true);
} finally {if(previous===undefined)delete process.env.RELEASE_CHANNEL;else process.env.RELEASE_CHANNEL=previous;}
console.log('technical JSON guard PASS');
