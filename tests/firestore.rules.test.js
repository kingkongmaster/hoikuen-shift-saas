const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

let env;
const projectId = 'hoikushift-rules-test';
const gardenA = 'garden-a';
const gardenB = 'garden-b';
const owner = 'owner-a';
const admin = 'admin-a';
const staff = 'staff-a';
const otherStaff = 'staff-b';
const outsider = 'outsider';

function db(uid) { return env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore(); }
function member(gardenId, uid, role, staffId) {
  return { uid, emailNormalized: `${uid}@example.test`, role, staffId, status: 'active' };
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `gardens/${gardenA}`), { name: 'A園', status: 'active', ownerUid: owner });
    await setDoc(doc(firestore, `gardens/${gardenB}`), { name: 'B園', status: 'active', ownerUid: 'owner-b' });
    await Promise.all([
      setDoc(doc(firestore, `gardens/${gardenA}/members/${owner}`), member(gardenA, owner, 'owner', null)),
      setDoc(doc(firestore, `gardens/${gardenA}/members/${admin}`), member(gardenA, admin, 'admin', null)),
      setDoc(doc(firestore, `gardens/${gardenA}/members/${staff}`), member(gardenA, staff, 'staff', 'staff-record-a')),
      setDoc(doc(firestore, `gardens/${gardenA}/members/${otherStaff}`), member(gardenA, otherStaff, 'staff', 'staff-record-b')),
      setDoc(doc(firestore, `gardens/${gardenB}/members/owner-b`), member(gardenB, 'owner-b', 'owner', null)),
      setDoc(doc(firestore, `gardens/${gardenA}/requests/request-own`), { uid: staff, staffId: 'staff-record-a', date: '2026-08-01', reason: '私用', status: 'pending', createdAt: new Date() }),
      setDoc(doc(firestore, `gardens/${gardenA}/requests/request-other`), { uid: otherStaff, staffId: 'staff-record-b', date: '2026-08-02', reason: '通院', status: 'pending', createdAt: new Date() })
    ]);
  });
});

test.after(async () => { await env.cleanup(); });

test('園メンバーは自園を読み取れるが、他園は読めない', async () => {
  await assertSucceeds(getDoc(doc(db(staff), `gardens/${gardenA}`)));
  await assertFails(getDoc(doc(db(staff), `gardens/${gardenB}`)));
});

test('ユーザーはusers経由でgardenIdやroleを偽装できない', async () => {
  await assertFails(setDoc(doc(db(outsider), `users/${outsider}`), { gardenId: gardenA, role: 'admin' }));
  await assertFails(setDoc(doc(db(staff), `gardens/${gardenA}/members/${staff}`), member(gardenA, staff, 'admin', 'staff-record-a')));
});

test('staffは管理データを書き込めず、adminは書き込める', async () => {
  await assertFails(setDoc(doc(db(staff), `gardens/${gardenA}/events/event-1`), { date: '2026-08-01', title: '行事' }));
  await assertSucceeds(setDoc(doc(db(admin), `gardens/${gardenA}/events/event-1`), { date: '2026-08-01', title: '行事' }));
  await assertFails(setDoc(doc(db(staff), `gardens/${gardenA}/staff/staff-new`), { name: '権限外', jobRoles: ['主任'] }));
  await assertSucceeds(setDoc(doc(db(admin), `gardens/${gardenA}/staff/staff-new`), { name: '管理者登録', jobRoles: ['主任', '担任'] }));
});

test('希望休は本人と管理者だけが閲覧でき、本人以外として申請できない', async () => {
  await assertSucceeds(getDoc(doc(db(staff), `gardens/${gardenA}/requests/request-own`)));
  await assertFails(getDoc(doc(db(staff), `gardens/${gardenA}/requests/request-other`)));
  await assertSucceeds(getDoc(doc(db(admin), `gardens/${gardenA}/requests/request-other`)));
  await assertSucceeds(setDoc(doc(db(staff), `gardens/${gardenA}/requests/request-new`), { uid: staff, staffId: 'staff-record-a', date: '2026-08-03', reason: '希望休', status: 'pending', createdAt: new Date() }));
  await assertFails(setDoc(doc(db(staff), `gardens/${gardenA}/requests/request-forged`), { uid: otherStaff, staffId: 'staff-record-b', date: '2026-08-03', reason: 'なりすまし', status: 'pending', createdAt: new Date() }));
});

test('希望休の承認はadminのみで、申請内容の改ざんは拒否される', async () => {
  await assertSucceeds(updateDoc(doc(db(admin), `gardens/${gardenA}/requests/request-own`), { status: 'approved' }));
  await assertFails(updateDoc(doc(db(admin), `gardens/${gardenA}/requests/request-other`), { reason: '改ざん' }));
  await assertFails(updateDoc(doc(db(staff), `gardens/${gardenA}/requests/request-own`), { status: 'approved' }));
});
