const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const INVITE_TTL_DAYS = 7;
const MAX_INVITE_TTL_DAYS = 30;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  return request.auth;
}
function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new HttpsError('invalid-argument', '有効なメールアドレスが必要です。');
  return email;
}
function requireString(value, field, max = 200) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new HttpsError('invalid-argument', `${field}を正しく入力してください。`);
  return result;
}
function inviteTtlDays(value) {
  if (value === undefined || value === null) return INVITE_TTL_DAYS;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_INVITE_TTL_DAYS) {
    throw new HttpsError('invalid-argument', `招待期限は1〜${MAX_INVITE_TTL_DAYS}日で指定してください。`);
  }
  return days;
}
function inviteHash(code) { return crypto.createHash('sha256').update(code).digest('hex'); }
function newInviteCode() { return crypto.randomBytes(32).toString('base64url'); }
function membershipsFor(uid) {
  return db.collectionGroup('members').where('uid', '==', uid);
}
async function activeMember(gardenId, uid, tx) {
  const ref = db.doc(`gardens/${gardenId}/members/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists || snap.data().status !== 'active') throw new HttpsError('permission-denied', 'この園の有効なメンバーではありません。');
  return snap.data();
}
async function requireAdmin(gardenId, uid, tx) {
  const member = await activeMember(gardenId, uid, tx);
  if (!['owner', 'admin'].includes(member.role)) throw new HttpsError('permission-denied', '管理者権限が必要です。');
  return member;
}
function memberRole(value) {
  const result = requireString(value, 'システム権限', 20);
  if (!['admin', 'staff'].includes(result)) throw new HttpsError('invalid-argument', '変更できる権限はadminまたはstaffです。');
  return result;
}

exports.createGarden = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = requireAuth(request);
  const name = requireString(request.data?.name, '園名', 100);
  const userRef = db.collection('users').doc(auth.uid);
  const gardenRef = db.collection('gardens').doc();
  const memberRef = gardenRef.collection('members').doc(auth.uid);

  await db.runTransaction(async (tx) => {
    const [user, memberships] = await Promise.all([tx.get(userRef), tx.get(membershipsFor(auth.uid))]);
    const currentGardenId = user.exists && (user.data().activeGardenId || user.data().gardenId);
    const hasActiveMembership = memberships.docs.some((member) => member.data().status === 'active');
    if (currentGardenId || hasActiveMembership) throw new HttpsError('failed-precondition', 'すでに園に所属しています。');
    tx.create(gardenRef, { name, ownerUid: auth.uid, status: 'active', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(memberRef, { uid: auth.uid, emailNormalized: normalizeEmail(auth.token.email), role: 'owner', staffId: null, status: 'active', joinedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    // gardenId/role/staffId remain only for existing UI compatibility. Rules never trust them.
    tx.set(userRef, { email: normalizeEmail(auth.token.email), activeGardenId: gardenRef.id, gardenId: gardenRef.id, role: 'owner', staffId: null, createdAt: user.exists ? user.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  logger.info('garden_created', { gardenId: gardenRef.id, uid: auth.uid });
  return { gardenId: gardenRef.id, role: 'owner', staffId: null };
});

exports.createInvite = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = requireAuth(request);
  const gardenId = requireString(request.data?.gardenId, '園ID');
  const staffId = requireString(request.data?.staffId, '職員ID');
  const staffRef = db.doc(`gardens/${gardenId}/staff/${staffId}`);
  const ttlDays = inviteTtlDays(request.data?.ttlDays);
  const code = newInviteCode();
  const inviteRef = db.doc(`gardens/${gardenId}/invites/${inviteHash(code)}`);
  await db.runTransaction(async (tx) => {
    await requireAdmin(gardenId, auth.uid, tx);
    const staff = await tx.get(staffRef);
    if (!staff.exists) throw new HttpsError('not-found', '職員が見つかりません。');
    const emailNormalized = normalizeEmail(staff.data().email);
    tx.create(inviteRef, { codeHash: inviteHash(code), emailNormalized, staffId, role: 'staff', status: 'issued', expiresAt: Timestamp.fromMillis(Date.now() + ttlDays * 86400000), createdBy: auth.uid, createdAt: FieldValue.serverTimestamp() });
    tx.update(staffRef, { invited: true, lastInviteAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  logger.info('invite_created', { gardenId, staffId, createdBy: auth.uid });
  return { code, expiresAt: new Date(Date.now() + ttlDays * 86400000).toISOString() };
});

exports.acceptInvite = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = requireAuth(request);
  const code = requireString(request.data?.code, '招待コード', 200);
  const codeHash = inviteHash(code);
  const emailNormalized = normalizeEmail(auth.token.email);
  const matches = await db.collectionGroup('invites').where('codeHash', '==', codeHash).limit(1).get();
  if (matches.empty) throw new HttpsError('not-found', '招待コードが見つかりません。');
  const inviteRef = matches.docs[0].ref;
  const gardenRef = inviteRef.parent.parent;
  const gardenId = gardenRef.id;
  const userRef = db.collection('users').doc(auth.uid);
  const memberRef = gardenRef.collection('members').doc(auth.uid);

  await db.runTransaction(async (tx) => {
    const [invite, user, member, garden, memberships] = await Promise.all([tx.get(inviteRef), tx.get(userRef), tx.get(memberRef), tx.get(gardenRef), tx.get(membershipsFor(auth.uid))]);
    if (!invite.exists || !garden.exists || garden.data().status !== 'active') throw new HttpsError('failed-precondition', 'この招待は利用できません。');
    const data = invite.data();
    if (data.status !== 'issued' || data.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', '招待コードは期限切れ、または利用済みです。');
    if (data.emailNormalized !== emailNormalized) throw new HttpsError('permission-denied', 'このメールアドレスでは招待を利用できません。');
    const currentGardenId = user.exists && (user.data().activeGardenId || user.data().gardenId);
    if (currentGardenId && currentGardenId !== gardenId) throw new HttpsError('failed-precondition', '別の園に所属しているため参加できません。');
    const hasOtherActiveMembership = memberships.docs.some((existing) =>
      existing.data().status === 'active' && existing.ref.parent.parent.id !== gardenId
    );
    if (hasOtherActiveMembership) throw new HttpsError('failed-precondition', '別の園に所属しているため参加できません。');
    if (member.exists && member.data().status === 'active') throw new HttpsError('already-exists', 'すでにこの園に参加しています。');
    tx.set(memberRef, { uid: auth.uid, emailNormalized, role: 'staff', staffId: data.staffId, status: 'active', joinedAt: FieldValue.serverTimestamp(), createdAt: member.exists ? member.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(userRef, { email: emailNormalized, activeGardenId: gardenId, gardenId, role: 'staff', staffId: data.staffId, createdAt: user.exists ? user.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(inviteRef, { status: 'used', usedBy: auth.uid, usedAt: FieldValue.serverTimestamp() });
  });
  logger.info('invite_accepted', { gardenId, uid: auth.uid });
  return { gardenId, role: 'staff' };
});

// Only an owner may grant or remove admin. Owner records are deliberately
// immutable here so an owner cannot accidentally lose the last owner role.
exports.setMemberRole = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = requireAuth(request);
  const gardenId = requireString(request.data?.gardenId, '園ID');
  const targetUid = requireString(request.data?.uid, '対象ユーザーID');
  const nextRole = memberRole(request.data?.role);
  if (targetUid === auth.uid) throw new HttpsError('failed-precondition', 'owner自身の権限はここでは変更できません。');
  const targetMemberRef = db.doc(`gardens/${gardenId}/members/${targetUid}`);
  const targetUserRef = db.collection('users').doc(targetUid);

  await db.runTransaction(async (tx) => {
    const actor = await activeMember(gardenId, auth.uid, tx);
    if (actor.role !== 'owner') throw new HttpsError('permission-denied', 'ownerのみが管理者権限を変更できます。');
    const target = await tx.get(targetMemberRef);
    if (!target.exists || target.data().status !== 'active') throw new HttpsError('not-found', '有効な対象メンバーが見つかりません。');
    if (target.data().role === 'owner') throw new HttpsError('failed-precondition', 'ownerの権限は変更できません。');
    tx.update(targetMemberRef, { role: nextRole, updatedAt: FieldValue.serverTimestamp() });
    // users.role remains only as a UI compatibility field; authorization always
    // uses the membership record above.
    tx.set(targetUserRef, { role: nextRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  logger.info('member_role_changed', { gardenId, targetUid, role: nextRole, changedBy: auth.uid });
  return { uid: targetUid, role: nextRole };
});

exports.revokeInvite = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = requireAuth(request);
  const gardenId = requireString(request.data?.gardenId, '園ID');
  const inviteId = requireString(request.data?.inviteId, '招待ID');
  const inviteRef = db.doc(`gardens/${gardenId}/invites/${inviteId}`);
  await db.runTransaction(async (tx) => {
    await requireAdmin(gardenId, auth.uid, tx);
    const invite = await tx.get(inviteRef);
    if (!invite.exists) throw new HttpsError('not-found', '招待が見つかりません。');
    if (invite.data().status !== 'issued') throw new HttpsError('failed-precondition', 'この招待は失効または利用済みです。');
    tx.update(inviteRef, { status: 'revoked', revokedBy: auth.uid, revokedAt: FieldValue.serverTimestamp() });
  });
  logger.info('invite_revoked', { gardenId, inviteId, revokedBy: auth.uid });
  return { revoked: true };
});
