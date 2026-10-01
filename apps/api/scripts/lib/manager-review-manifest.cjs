'use strict';
const {createHash}=require('node:crypto');
const {dateInMonth,provenance}=require('./monthly-input-fields.cjs');
function prepareReviewRows(manifest,tenantId,lookup) {
 const {validateItem}=require('../../dist/application/manager-resolution/resolution');
 if(manifest.schemaVersion!==1||manifest.packageType!=='MONTHLY_MANAGER_REVIEW'||!Array.isArray(manifest.items))throw Error('INVALID_MANAGER_MANIFEST');
 const seen=new Set();
 return manifest.items.map(row=>{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(row.key)||seen.has(row.key))throw Error('INVALID_REVIEW_KEY');seen.add(row.key);
  const refs=provenance(row);for(const date of row.dates)dateInMonth(date,manifest.month);
  if(!Array.isArray(row.staffCodes)||!row.staffCodes.length)throw Error('INVALID_REVIEW_TARGET');
  const staffIds=row.staffCodes.map(code=>{const id=lookup.staffIds.get(code);if(!id)throw Error('REVIEW_TARGET_OUTSIDE_TENANT');return id;});
  if(row.staffCodes.length!==1||row.dates.length!==1)throw Error('SPLIT_INDEPENDENT_ANSWERS_INTO_GROUP');
  const digest=createHash('sha256').update(`${tenantId}:${manifest.month}:${row.key}`).digest('hex');const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  const options=Object.keys(row.optionEffects??{});if(!options.length)throw Error('MISSING_ANSWER_EFFECTS');
  for(const effects of Object.values(row.optionEffects)){if(!Array.isArray(effects)||!effects.length)throw Error('INVALID_ANSWER_EFFECTS');for(const effect of effects){if(!['REQUEST','PATTERN','TIME','REMOVE_EVENT_TARGET','NO_WORK'].includes(effect.type))throw Error('INVALID_ANSWER_EFFECT');if(['PATTERN','TIME'].includes(effect.type)&&!lookup.patternCodes.has(effect.code??effect.basePatternCode))throw Error('INVALID_REVIEW_PATTERN');if(effect.type==='REMOVE_EVENT_TARGET'&&!lookup.eventIds.has(effect.eventId))throw Error('INVALID_REVIEW_EVENT');}}
  const item={id,tenantId,month:manifest.month,groupId:row.groupId,dates:row.dates,staffIds,kind:row.kind,reason:row.reason,knownConditions:row.knownConditions,impact:row.impact,options,optionLabels:row.optionLabels??{},optionEffects:row.optionEffects,sourceReferences:row.sourceReferences,status:'NEEDS_MANAGER_REVIEW',revision:1};validateItem(item);
  return {id,tenantId,exceptionDate:dateInMonth(row.dates[0],manifest.month),exceptionType:`MANAGER_REVIEW:${row.key}`,configuration:item,reason:row.reason,...refs,version:1,isActive:true};
 });
}
module.exports={prepareReviewRows};
