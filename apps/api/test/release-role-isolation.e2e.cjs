const assert = require('node:assert/strict');
const { Client } = require('pg');
require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
async function main() {
  const migrationUrl = new URL(process.env.DATABASE_URL);
  assert.equal(migrationUrl.username, 'aen_migrator');
  const appUrl = new URL(migrationUrl); appUrl.username = 'aen_app';
  const migration = new Client({connectionString:migrationUrl.href});
  const app = new Client({connectionString:appUrl.href});
  const backupUrl=new URL(migrationUrl);backupUrl.username='aen_backup';
  const backup=new Client({connectionString:backupUrl.href});
  await migration.connect(); await app.connect(); await backup.connect();
  try {
    assert.equal(Number((await migration.query('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].count),30);
    assert.equal((await migration.query("SELECT extname FROM pg_extension WHERE extname='btree_gist'")).rowCount,1);
    await migration.query('CREATE TABLE public.release_gate_probe (id integer PRIMARY KEY, value integer)');
    await app.query('INSERT INTO public.release_gate_probe VALUES (1, 10)');
    await app.query('UPDATE public.release_gate_probe SET value=11 WHERE id=1');
    assert.equal((await app.query('SELECT value FROM public.release_gate_probe')).rows[0].value,11);
    assert.equal((await backup.query('SELECT value FROM public.release_gate_probe')).rows[0].value,11);
    for(const sql of ['INSERT INTO public.release_gate_probe VALUES(2,1)','UPDATE public.release_gate_probe SET value=1','DELETE FROM public.release_gate_probe','CREATE TABLE public.backup_forbidden(id int)']) await assert.rejects(backup.query(sql),e=>e.code==='42501');
    await app.query('DELETE FROM public.release_gate_probe');
    for(const sql of ['CREATE TABLE public.forbidden_probe (id int)', 'ALTER TABLE public.release_gate_probe ADD COLUMN forbidden int', 'DROP TABLE public.release_gate_probe', 'CREATE SCHEMA forbidden_schema', 'CREATE TEMP TABLE forbidden_temp (id int)', 'SELECT * FROM public._prisma_migrations', 'DELETE FROM public._prisma_migrations', 'SET ROLE aen_migrator', 'DELETE FROM public.aen_release_migration_status']) {
      await assert.rejects(app.query(sql), error=>error.code==='42501');
    }
    assert.equal((await app.query('SELECT * FROM public.aen_release_migration_status')).rowCount,30);
    const {PrismaClient}=require('@prisma/client');
    const prisma=new PrismaClient({datasources:{db:{url:appUrl.href}}});
    const previous={deployment:process.env.DEPLOYMENT_ENV,target:process.env.DATABASE_TARGET_DATABASE};
    try {
      process.env.DEPLOYMENT_ENV='production';process.env.DATABASE_TARGET_DATABASE=migrationUrl.pathname.slice(1);
      await require('../scripts/lib/production-operation-guard.cjs').assertDatabaseSafety(prisma,null,{requireTenant:false});
    } finally {
      await prisma.$disconnect();
      if(previous.deployment===undefined) delete process.env.DEPLOYMENT_ENV;else process.env.DEPLOYMENT_ENV=previous.deployment;
      if(previous.target===undefined) delete process.env.DATABASE_TARGET_DATABASE;else process.env.DATABASE_TARGET_DATABASE=previous.target;
    }
    const {spawnSync}=require('node:child_process');
    const migrate=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,DATABASE_URL:appUrl.href},encoding:'utf8'});
    assert.notEqual(migrate.status,0,'app role must not run migrate deploy');
    assert.ok(/permission denied/i.test(migrate.stdout+migrate.stderr),'migrate refusal must be a privilege error');
    console.log('PG16 role isolation PASS: 30 migrations, btree_gist, app CRUD, nine privilege denials');
  } finally {
    await migration.query('DROP TABLE IF EXISTS public.release_gate_probe');
    await backup.end(); await app.end(); await migration.end();
  }
}
main().catch(()=>{console.error('role isolation FAIL');process.exitCode=1;});
