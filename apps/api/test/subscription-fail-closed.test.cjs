const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SubscriptionsService}=require('../dist/presentation/subscriptions/subscriptions.service');
const {FeaturesService}=require('../dist/presentation/features/features.service');
const {FEATURE_CODES}=require('../dist/domain/features/feature-catalog');
function fixture(row,error){if(row)row={tenantId:'anonymous',staffLimit:20,trialStartedAt:new Date(Date.now()-86400000),trialEndsAt:new Date(Date.now()+86400000),currentPeriodStartedAt:new Date(Date.now()-86400000),currentPeriodEndsAt:new Date(Date.now()+86400000),...row};let overrides=0;const db={tenantSubscription:{findUnique:async()=>{if(error)throw error;return row}},tenantFeature:{findUnique:async()=>{overrides++;return {tenantId:'anonymous',enabled:true,source:'MANUAL',validFrom:null,validTo:null}}},staff:{count:async()=>0}};const service=new SubscriptionsService(db,{},{});return {service,features:new FeaturesService(db,service,{}),overrides:()=>overrides};}
const denied=e=>e.getStatus()===403&&e.getResponse().code==='SUBSCRIPTION_UNVERIFIED';
for(const [name,row] of [['missing',null],['unknown plan',{plan:'UNKNOWN',status:'ACTIVE'}],['unknown status',{plan:'STANDARD',status:'UNKNOWN'}],['trial without expiry',{plan:'TRIAL',status:'TRIAL',trialEndsAt:null}],['invalid trial expiry',{plan:'TRIAL',status:'TRIAL',trialEndsAt:new Date('invalid')}]] ){
 test(name+' blocks every feature and write/capacity check',async()=>{const f=fixture(row);await assert.rejects(f.service.find('anonymous'),denied);await assert.rejects(f.service.assertWritable('anonymous'),denied);await assert.rejects(f.service.assertStaffCapacity('anonymous'),denied);for(const code of FEATURE_CODES)await assert.rejects(f.features.resolve('anonymous',code),denied);assert.equal(f.overrides(),0);});
}
test('database failure propagates, without opening overrides',async()=>{const error=new Error('isolated unavailable');const f=fixture(null,error);await assert.rejects(f.features.resolve('anonymous','BASIC_SHIFT_GENERATION'),e=>e===error);await assert.rejects(f.service.assertWritable('anonymous'),e=>e===error);assert.equal(f.overrides(),0);});
test('known active contract is writable',async()=>{for(const status of ['ACTIVE']){const f=fixture({plan:'STANDARD',status});await f.service.assertWritable('anonymous');assert.equal((await f.features.resolve('anonymous','BASIC_SHIFT_GENERATION')).enabled,true);}});
test('expired, cancelled, suspended contracts cannot be overridden',async()=>{for(const status of ['EXPIRED','CANCELLED','SUSPENDED','PAST_DUE']){const f=fixture({plan:'PROFESSIONAL',status});await assert.rejects(f.service.assertWritable('anonymous'));assert.equal((await f.features.resolve('anonymous','ADVANCED_WORK_PATTERNS')).enabled,false);assert.equal(f.overrides(),0);}});
test('future trial allowed, elapsed trial denied; unknown readOnly is closed',async()=>{const f=fixture({plan:'TRIAL',status:'TRIAL',trialEndsAt:new Date(Date.now()+86400000)});await f.service.assertWritable('anonymous');const expired=fixture({plan:'TRIAL',status:'TRIAL',trialStartedAt:new Date(-86400000),trialEndsAt:new Date(0)});await assert.rejects(expired.service.assertWritable('anonymous'));assert.equal(f.service.readOnly(null),true);assert.equal(f.service.readOnly({status:'UNKNOWN'}),true);});
for(const [name,row] of [
 ['negative capacity',{plan:'STANDARD',status:'ACTIVE',staffLimit:-1}],
 ['fractional capacity',{plan:'STANDARD',status:'ACTIVE',staffLimit:1.5}],
 ['trial as active',{plan:'TRIAL',status:'ACTIVE'}],
 ['reversed period',{plan:'STANDARD',status:'ACTIVE',currentPeriodStartedAt:new Date('2030-01-02'),currentPeriodEndsAt:new Date('2030-01-01')}],
 ['future paid period',{plan:'STANDARD',status:'ACTIVE',currentPeriodStartedAt:new Date(Date.now()+86400000)}],
])test(name+' fails closed',async()=>{const f=fixture(row);for(const code of FEATURE_CODES)await assert.rejects(f.features.resolve('anonymous',code),denied);assert.equal(f.overrides(),0);});
test('elapsed paid period closes features even with ACTIVE status',async()=>{const f=fixture({plan:'PROFESSIONAL',status:'ACTIVE',currentPeriodStartedAt:new Date(-86400000),currentPeriodEndsAt:new Date(0)});await assert.rejects(f.service.assertWritable('anonymous'));for(const code of FEATURE_CODES)assert.equal((await f.features.resolve('anonymous',code)).enabled,false);assert.equal(f.overrides(),0);});
for(const row of [
 {plan:'STANDARD',status:'ACTIVE',tenantId:'foreign'},
 {plan:'STANDARD',status:'ACTIVE',currentPeriodStartedAt:null},
 {plan:'STANDARD',status:'ACTIVE',currentPeriodEndsAt:null},
 {plan:'TRIAL',status:'TRIAL',trialStartedAt:null},
 {plan:'STANDARD',status:'TRIAL'},
 {plan:'STANDARD',status:'ACTIVE',staffLimit:1001},
 {plan:'STANDARD',status:'ACTIVE',cancelledAt:new Date('invalid')},
 {plan:'STANDARD',status:'ACTIVE',cancelledAt:new Date(Date.now()+10*86400000)},
])test('malformed contract '+JSON.stringify(row)+' rejects APIs',async()=>{const f=fixture(row);await assert.rejects(f.service.find('anonymous'),denied);await assert.rejects(f.service.assertWritable('anonymous'));});
test('period boundary is exclusive, cancellation is derived without changing stored status',()=>{
 const {verifyContract,contractState}=require('../dist/domain/subscriptions/contract-policy');const start=new Date('2030-01-01'),end=new Date('2030-02-01');
 const row={tenantId:'anonymous',plan:'STANDARD',status:'ACTIVE',staffLimit:50,currentPeriodStartedAt:start,currentPeriodEndsAt:end,cancelledAt:end};
 assert.equal(contractState(verifyContract(row,'anonymous',new Date(end-1))),'CANCELLATION_SCHEDULED');
 assert.equal(contractState(verifyContract(row,'anonymous',end)),'CANCELLED');assert.equal(row.status,'ACTIVE');
 assert.equal(verifyContract({...row,cancelledAt:null},'anonymous',end).status,'EXPIRED');
});
test('tampered feature override cannot open or preserve a paid entitlement',()=>{
 const {resolveVerifiedFeature}=require('../dist/domain/features/feature-catalog');
 for(const override of [{enabled:true,source:'UNKNOWN'},{enabled:true,source:'MANUAL',validFrom:new Date('invalid')},{enabled:true,source:'MANUAL',validFrom:new Date('2030-02-01'),validTo:new Date('2030-01-01')}])assert.equal(resolveVerifiedFeature('PROFESSIONAL',false,'STAFF_WORK_RULES',override).enabled,false);
 assert.equal(resolveVerifiedFeature('PROFESSIONAL',false,'TENANT_CUSTOM_RULES',{enabled:true,source:'PLAN_OVERRIDE'}).enabled,false);
});
