// Limited operations entrypoint. Input values stay on stdin; never print database errors.
const { Client } = require('pg');
const FIELDS = ['name', 'displayName', 'postalCode', 'prefecture', 'city', 'addressLine', 'phone', 'contactName', 'contactEmail'];
const ACTION = 'TENANT_PROFILE_APPROVED_FIELDS_UPDATED';
async function main(input, { connectionString = process.env.DATABASE_URL, apply = false, injectFailure = false } = {}) {
  if (!input || !/^[a-f0-9-]{36}$/i.test(input.tenantId || '') || !input.tenantCode || !input.approvalReference) throw Error('INPUT_GATE');
  for (const key of ['values', 'expected']) {
    if (JSON.stringify(Object.keys(input[key] || {}).sort()) !== JSON.stringify([...FIELDS].sort())) throw Error('FIELD_ALLOWLIST');
    for (const field of FIELDS) if (input[key][field] !== null && typeof input[key][field] !== 'string') throw Error('VALUE_TYPE');
  }
  if (FIELDS.some(f => !input.values[f]?.trim()) || !/^\S+@\S+\.\S+$/.test(input.values.contactEmail) || !Array.isArray(input.sourceIds) || !input.sourceIds.length) throw Error('VALUE_GATE');
  if (injectFailure && process.env.NODE_ENV !== 'test') throw Error('TEST_ONLY');
  if (process.env.DEPLOYMENT_ENV === 'production' && (process.env.ALLOW_APPROVED_PROFILE_UPDATE !== 'true' || input.tenantCode !== 'musubi-nursery' || input.tenantId !== '6e2b1af2-e30b-47b7-9c1d-adfcda6eea22')) throw Error('PRODUCTION_GATE');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const identity = (await client.query('SELECT current_user AS role, current_database() AS db')).rows[0];
    if (process.env.DEPLOYMENT_ENV === 'production' && (identity.role !== 'aen_app' || identity.db !== 'aen_shift_prod')) throw Error('DATABASE_GATE');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'");
    await client.query("SELECT set_config('aen.profile_input', $1, true)", [JSON.stringify({ ...input, injectFailure, production: process.env.DEPLOYMENT_ENV === 'production' })]);
    await client.query(`DO $profile$
DECLARE p jsonb := current_setting('aen.profile_input')::jsonb; t record; old_t jsonb; new_t jsonb;
  before_tables jsonb := '{}'::jsonb; after_table jsonb; before_audit jsonb; other_tenants jsonb; actor uuid; n integer;
  keys text[] := ARRAY['name','displayName','postalCode','prefecture','city','addressLine','phone','contactName','contactEmail'];
BEGIN
  -- Freeze business writes briefly; abort on contention, never wait indefinitely.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',t.tablename);
  END LOOP;
  IF (p->>'production')::boolean AND ((SELECT count(*) FROM "Tenant")<>1 OR (SELECT count(*) FROM "Staff")<>23 OR
    (SELECT count(*) FROM "User")<>1 OR (SELECT count(*) FROM "Membership")<>1 OR
    (SELECT count(*) FROM "MonthlyShift")<>0 OR (SELECT count(*) FROM "ShiftAssignment")<>0) THEN RAISE EXCEPTION 'PRODUCTION_COUNTS'; END IF;
  SELECT to_jsonb(x) INTO old_t FROM "Tenant" x WHERE id=(p->>'tenantId')::uuid AND code=p->>'tenantCode';
  IF old_t IS NULL THEN RAISE EXCEPTION 'TENANT_GATE'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) INTO other_tenants FROM "Tenant" x WHERE id<>(p->>'tenantId')::uuid;
  IF (SELECT jsonb_object_agg(k,old_t->k) FROM unnest(keys) k) <> p->'expected' THEN RAISE EXCEPTION 'STALE_PROFILE'; END IF;
  SELECT count(*), min("userId"::text)::uuid INTO n,actor FROM "Membership" WHERE "tenantId"=(p->>'tenantId')::uuid AND role='ADMIN' AND "isActive";
  IF n <> 1 THEN RAISE EXCEPTION 'ADMIN_GATE'; END IF;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('Tenant','AuditLog','_prisma_migrations') ORDER BY tablename LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT to_jsonb(x) v FROM %I x) s',t.tablename) INTO after_table;
    before_tables := before_tables || jsonb_build_object(t.tablename,after_table);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) INTO before_audit FROM "AuditLog" a;
  UPDATE "Tenant" SET name=p->'values'->>'name', "displayName"=p->'values'->>'displayName',
    "postalCode"=p->'values'->>'postalCode',prefecture=p->'values'->>'prefecture',city=p->'values'->>'city',
    "addressLine"=p->'values'->>'addressLine',phone=p->'values'->>'phone',
    "contactName"=p->'values'->>'contactName',"contactEmail"=p->'values'->>'contactEmail'
    WHERE id=(p->>'tenantId')::uuid;
  SELECT to_jsonb(x) INTO new_t FROM "Tenant" x WHERE id=(p->>'tenantId')::uuid;
  IF old_t-keys <> new_t-keys OR (SELECT jsonb_object_agg(k,new_t->k) FROM unnest(keys) k) <> p->'values' THEN RAISE EXCEPTION 'TENANT_POSTCONDITION'; END IF;
  IF other_tenants <> (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM "Tenant" x WHERE id<>(p->>'tenantId')::uuid) THEN RAISE EXCEPTION 'OTHER_TENANT_CHANGED'; END IF;
  FOR t IN SELECT key,value FROM jsonb_each(before_tables) LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT to_jsonb(x) v FROM %I x) s',t.key) INTO after_table;
    IF after_table <> t.value THEN RAISE EXCEPTION 'PROTECTED_TABLE_CHANGED'; END IF;
  END LOOP;
  IF before_audit <> (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM "AuditLog" a) THEN RAISE EXCEPTION 'AUDIT_CHANGED'; END IF;
  INSERT INTO "AuditLog" (id,"tenantId","memberId",action,"targetType","targetId",detail,"createdAt")
    VALUES(gen_random_uuid(),(p->>'tenantId')::uuid,actor,'${ACTION}','Tenant',p->>'tenantId',jsonb_build_object(
    'actorType','PRODUCT_OWNER_AUTHORIZED_OPERATIONS','actorAttribution','ADMIN relation required by schema; not self-service',
    'approvalReference',p->>'approvalReference','sourceIds',p->'sourceIds','changedFields',to_jsonb(keys),'credentialOperation',false),now());
  IF (p->>'injectFailure')::boolean THEN RAISE EXCEPTION 'INJECTED_FAILURE'; END IF;
END $profile$;`);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { status: 'PASS', mode: apply ? 'APPLY' : 'DRY_RUN_ROLLBACK', fields: 9, protectedTablesUnchanged: true, auditAdded: apply ? 1 : 0, credentialOperation: false };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw Error('PROFILE_TRANSACTION_HOLD'); }
  finally { await client.end(); }
}
module.exports = { main, FIELDS, ACTION };
if (require.main === module) {
  let raw = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; if (raw.length > 20000) process.exit(2); });
  process.stdin.on('end', async () => { try { const result = await main(JSON.parse(raw), { apply: process.argv.includes('--apply') }); raw = ''; console.log(JSON.stringify(result)); } catch { console.error('PROFILE_UPDATE_HOLD; no automatic retry; inspect state read-only.'); process.exitCode=1; } });
}
