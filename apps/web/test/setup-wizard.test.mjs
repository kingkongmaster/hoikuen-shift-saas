import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canUseSetupWizard,
  isSetupComplete,
  moveSetupStep,
  resumeSetupStep,
  setupLayoutForWidth,
  validateSetupStep,
} from '../src/features/setup/setup-wizard-state.js';

const validDraft = {
  tenant: { name: 'ひかり保育園', contactEmail: 'director@example.test' },
  workSettings: {
    weekdayEarlyRequired: 2,
    weekdayLateRequired: 2,
    maxConsecutiveWorkDays: 6,
    defaultStartEarly: '07:00',
    defaultEndEarly: '16:00',
    defaultStartNormal: '09:00',
    defaultEndNormal: '18:00',
    defaultStartLate: '10:30',
    defaultEndLate: '20:00',
  },
  classRequirements: [{ weekdayRequired: 2 }, { weekdayRequired: 0 }],
  accepted: true,
};

assert.equal(moveSetupStep(1, 1), 2, '次のStepへ進める');
assert.equal(moveSetupStep(5, 1), 5, '最終Stepを越えない');
assert.equal(moveSetupStep(1, -1), 1, '最初のStepより前へ戻らない');
assert.equal(resumeSetupStep({ setupStatus: 'IN_PROGRESS', setupCurrentStep: 3 }), 3, '保存済みStepから再開する');
assert.equal(resumeSetupStep({ setupStatus: 'IN_PROGRESS', setupCurrentStep: 7 }), 5, 'APIの完了Stepは画面Stepへ正規化する');
assert.equal(isSetupComplete({ setupStatus: 'COMPLETED' }), true, '完了済みを判定する');
assert.equal(isSetupComplete({ setupStatus: 'IN_PROGRESS', setupCompletedAt: '2026-07-23T00:00:00Z' }), true, '完了日時でも完了済みを判定する');
assert.equal(canUseSetupWizard('ADMIN'), true, 'ADMINは利用可能');
assert.equal(canUseSetupWizard('DIRECTOR'), true, 'DIRECTORは利用可能');
assert.equal(canUseSetupWizard('CHIEF'), false, 'CHIEFは利用不可');
assert.equal(canUseSetupWizard('STAFF'), false, 'STAFFは利用不可');
assert.equal(setupLayoutForWidth(390), 'mobile', '390pxはスマホレイアウト');
assert.equal(setupLayoutForWidth(391), 'desktop', '391px以上はPCレイアウト');
assert.deepEqual(validateSetupStep(1, validDraft), [], '園情報の正常入力');
assert.match(validateSetupStep(1, { ...validDraft, tenant: { name: '', contactEmail: 'invalid' } })[0], /園名/, '園名必須');
assert.match(validateSetupStep(2, { ...validDraft, workSettings: { ...validDraft.workSettings, weekdayEarlyRequired: -1 } })[0], /0以上/, '人数は0以上');
assert.match(validateSetupStep(4, { ...validDraft, accepted: false })[0], /同意/, '未同意では進めない');

const clientSource = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
const wizardSource = await readFile(new URL('../src/features/setup/SetupWizard.tsx', import.meta.url), 'utf8');
assert.ok(wizardSource.includes('saturdayMinimumStaff: 3') && wizardSource.includes('土曜最低勤務人数'), '土曜最低人数の初期値と設定欄');
for (const time of ['08:30', '17:00', '07:00', '16:00', '11:00', '19:30']) assert.ok(wizardSource.includes(`'${time}'`), `勤務時間初期値 ${time}`);
for (const endpoint of [
  '/setup',
  '/setup/tenant',
  '/setup/work-settings',
  '/setup/class-requirements',
  '/setup/progress',
  '/setup/consents',
  '/setup/complete',
]) {
  assert.ok(clientSource.includes(`'${endpoint}'`), `${endpoint} に接続している`);
}
assert.ok(wizardSource.includes('sm:grid-cols-2'), 'レスポンシブレイアウトを持つ');
assert.ok(wizardSource.includes("setToast({ kind: 'error'"), 'API失敗をToast表示する');
assert.ok(wizardSource.includes('setStep(nextStep)'), '保存後にStep遷移する');
assert.ok(wizardSource.includes('onComplete(completed)'), '完了後にDashboardへ進める');

console.log('Sprint 9-B2 Web tests: PASS (Step遷移・保存契約・途中再開・完了・完了済みスキップ・権限制御・390px・入力検証)');
