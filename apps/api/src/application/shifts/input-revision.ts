import { createHash } from 'node:crypto';
import type { MonthlyGenerationContext } from './monthly-generation-context-builder';
function canonical(value: unknown): unknown {
  if(value instanceof Date)return value.toISOString();
  if(value instanceof Set)return canonical([...value]);
  if(Array.isArray(value))return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export function inputRevision(context: MonthlyGenerationContext) {
  const {assignments,weekBoundaryAssignments,...inputs}=context;
  return {inputDigest:digest({...inputs,weekBoundaryAssignments:weekBoundaryAssignments.filter(row=>row.workDate<context.range.start||row.workDate>=context.range.end)}),assignmentsDigest:digest(assignments)};
}
