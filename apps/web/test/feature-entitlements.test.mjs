import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
const hook = await readFile(new URL('../src/features/features/use-feature.ts', import.meta.url), 'utf8');
const shifts = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');
assert.match(client, /export type FeatureCode/);
assert.match(client, /BASIC_SHIFT_GENERATION/);
assert.match(client, /request<EffectiveFeatures>\('\/features'/);
assert.match(hook, /export function hasFeature/);
assert.match(hook, /export function useFeature/);
assert.match(shifts, /useFeature\(session\.accessToken, 'BASIC_SHIFT_GENERATION'\)/);
assert.match(shifts, /canGenerate = session\.role === 'ADMIN' && basicGeneration\.enabled/);
console.log('Web feature entitlement tests: PASS (7 checks)');
