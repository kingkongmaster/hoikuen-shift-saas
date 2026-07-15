const crypto = require('crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const functionsRequire = createRequire(path.join(__dirname, '../functions/package.json'));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = functionsRequire('firebase-admin/app');
const { getFirestore, Timestamp } = functionsRequire('firebase-admin/firestore');

const projectId = process.env.GCLOUD_PROJECT || 'hoikushift-functions-test';
const firebaseConfig = { apiKey: 'test-api-key', authDomain: 'localhost', projectId };
const authUrl = `http://127.0.0.1:9099`;
const firestoreClearUrl = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`;
const authClearUrl = `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`;
let appSequence = 0;
const adminApp = initializeAdminApp({ projectId }, 'functions-integration-seed');
const db = getFirestore(adminApp);

function hash(code) { return crypto.createHash('sha256').update(code).digest('hex'); }
function emailFor(label) { return `${label}@example.test`; }
async function clearEmulators() {
  const [firestore, auth] = await Promise.all([
    fetch(firestoreClearUrl, { method: 'DELETE' }),
    fetch(authClearUrl, { method: 'DELETE' })
  ]);
  if (!firestore.ok || !auth.ok) throw new Error(`Emulator clear failed: Firestore=${firestore.status}, Auth=${auth.status}`);
}
async function client(label, signedIn = true) {
  const app = initializeApp(firebaseConfig, `functions-test-${appSequence++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, authUrl, { disableWarnings: true });
  if (signedIn) await createUserWithEmailAndPassword(auth, emailFor(label), 'Passw0rd!');
  const functions = getFunctions(app, 'asia-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return {
    uid: signedIn ? auth.currentUser.uid : null,
    email: signedIn ? emailFor(label) : null,
    call: (name, data) => httpsCallable(functions, name)(data),
    close: () => deleteApp(app)
  };
}
async function seedGarden(gardenId, owner, members, staff = []) {
  const batch = db.batch();
  batch.set(db.doc(`gardens/${gardenId}`), { name: `${gardenId}園`, ownerUid: owner.uid, status: 'active' });
  for (const member of members) {
    batch.set(db.doc(`gardens/${gardenId}/members/${member.uid}`), {
      uid: member.uid,
      emailNormalized: member.email,
      role: member.role,
      staffId: member.staffId || null,
      status: 'active'
    });
  }
  for (const entry of staff) batch.set(db.doc(`gardens/${gardenId}/staff/${entry.id}`), entry);
  await batch.commit();
}
async function expectFunctionError(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

test.beforeEach(clearEmulators);
test.after(async () => { await deleteAdminApp(adminApp); });

test('未認証の呼出しは拒否される', async () => {
  const anonymous = await client('anonymous', false);
  await expectFunctionError(anonymous.call('createGarden', { name: '未認証園' }), 'functions/unauthenticated');
  await anonymous.close();
});

test('createGardenはowner membershipをトランザクションで作成する', async () => {
  const owner = await client('new-owner');
  const result = await owner.call('createGarden', { name: '新規園' });
  const [garden, member, user] = await Promise.all([
    db.doc(`gardens/${result.data.gardenId}`).get(),
    db.doc(`gardens/${result.data.gardenId}/members/${owner.uid}`).get(),
    db.doc(`users/${owner.uid}`).get()
  ]);
  assert.equal(garden.data().ownerUid, owner.uid);
  assert.equal(member.data().role, 'owner');
  assert.equal(member.data().status, 'active');
  assert.equal(user.data().gardenId, result.data.gardenId);
  await owner.close();
});

test('staffと他園管理者は招待の作成・失効を実行できない', async () => {
  const ownerA = await client('owner-a');
  const staffA = await client('staff-a');
  const ownerB = await client('owner-b');
  await seedGarden('garden-a', ownerA, [
    { ...ownerA, role: 'owner' },
    { ...staffA, role: 'staff', staffId: 'staff-a' }
  ], [{ id: 'staff-a', email: staffA.email, name: 'Staff A' }]);
  await seedGarden('garden-b', ownerB, [{ ...ownerB, role: 'owner' }], [{ id: 'staff-b', email: emailFor('invitee-b'), name: 'Staff B' }]);
  await db.doc('gardens/garden-a/invites/revocable').set({ status: 'issued' });
  await expectFunctionError(staffA.call('createInvite', { gardenId: 'garden-a', staffId: 'staff-a' }), 'functions/permission-denied');
  await expectFunctionError(staffA.call('revokeInvite', { gardenId: 'garden-a', inviteId: 'revocable' }), 'functions/permission-denied');
  await expectFunctionError(ownerA.call('createInvite', { gardenId: 'garden-b', staffId: 'staff-b' }), 'functions/permission-denied');
  await ownerA.close(); await staffA.close(); await ownerB.close();
});

test('ownerだけがadminを付与・解除でき、owner権限は変更できない', async () => {
  const owner = await client('role-owner');
  const staffMember = await client('role-staff');
  const otherOwner = await client('role-other-owner');
  await seedGarden('garden-roles', owner, [
    { ...owner, role: 'owner' },
    { ...staffMember, role: 'staff', staffId: 'staff-role' },
    { ...otherOwner, role: 'owner' }
  ]);
  await expectFunctionError(staffMember.call('setMemberRole', { gardenId: 'garden-roles', uid: owner.uid, role: 'admin' }), 'functions/permission-denied');
  await owner.call('setMemberRole', { gardenId: 'garden-roles', uid: staffMember.uid, role: 'admin' });
  const [member, profile] = await Promise.all([
    db.doc(`gardens/garden-roles/members/${staffMember.uid}`).get(),
    db.doc(`users/${staffMember.uid}`).get()
  ]);
  assert.equal(member.data().role, 'admin');
  assert.equal(profile.data().role, 'admin');
  await owner.call('setMemberRole', { gardenId: 'garden-roles', uid: staffMember.uid, role: 'staff' });
  await expectFunctionError(owner.call('setMemberRole', { gardenId: 'garden-roles', uid: otherOwner.uid, role: 'staff' }), 'functions/failed-precondition');
  await owner.close(); await staffMember.close(); await otherOwner.close();
});

test('期限切れの招待はacceptInviteで拒否される', async () => {
  const owner = await client('expired-owner');
  const invitee = await client('expired-invitee');
  const code = 'expired-invite-code';
  await seedGarden('garden-expired', owner, [{ ...owner, role: 'owner' }], [{ id: 'staff-expired', email: invitee.email, name: 'Expired Staff' }]);
  await db.doc(`gardens/garden-expired/invites/${hash(code)}`).set({
    codeHash: hash(code), emailNormalized: invitee.email, staffId: 'staff-expired', role: 'staff', status: 'issued',
    expiresAt: Timestamp.fromMillis(Date.now() - 1000)
  });
  await expectFunctionError(invitee.call('acceptInvite', { code }), 'functions/failed-precondition');
  await owner.close(); await invitee.close();
});

test('メール不一致・招待再利用を拒否し、revokeInviteは招待を失効する', async () => {
  const owner = await client('invite-owner');
  const invitee = await client('invitee');
  const wrongEmail = await client('wrong-email');
  await seedGarden('garden-invite', owner, [{ ...owner, role: 'owner' }], [
    { id: 'staff-invite', email: invitee.email, name: 'Invite Staff' },
    { id: 'staff-revoke', email: emailFor('revoked-invitee'), name: 'Revoke Staff' }
  ]);
  const invitation = await owner.call('createInvite', { gardenId: 'garden-invite', staffId: 'staff-invite' });
  await expectFunctionError(wrongEmail.call('acceptInvite', { code: invitation.data.code }), 'functions/permission-denied');
  const accepted = await invitee.call('acceptInvite', { code: invitation.data.code });
  assert.equal(accepted.data.gardenId, 'garden-invite');
  const member = await db.doc(`gardens/garden-invite/members/${invitee.uid}`).get();
  assert.equal(member.data().staffId, 'staff-invite');
  await expectFunctionError(invitee.call('acceptInvite', { code: invitation.data.code }), 'functions/failed-precondition');
  const revokeInvitation = await owner.call('createInvite', { gardenId: 'garden-invite', staffId: 'staff-revoke' });
  const inviteId = hash(revokeInvitation.data.code);
  await owner.call('revokeInvite', { gardenId: 'garden-invite', inviteId });
  const revoked = await db.doc(`gardens/garden-invite/invites/${inviteId}`).get();
  assert.equal(revoked.data().status, 'revoked');
  await owner.close(); await invitee.close(); await wrongEmail.close();
});
