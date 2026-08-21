const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const ISOLATED_DATABASE_NAME = /(?:^|[_-])(test|testing|isolated)(?:$|[_-])/i;

function resolveIsolatedDatabaseUrl(env = process.env) {
  const value = env.TEST_DATABASE_URL || env.DATABASE_URL;
  if (env.TEST_DATABASE_ISOLATED !== 'true' || !value) {
    throw new Error('Database safety stop: TEST_DATABASE_ISOLATED=true and an explicit test database URL are required.');
  }
  if (env.TEST_DATABASE_URL && env.DATABASE_URL && env.TEST_DATABASE_URL !== env.DATABASE_URL) {
    throw new Error('Database safety stop: TEST_DATABASE_URL and DATABASE_URL must identify the same isolated database.');
  }

  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname) || !ISOLATED_DATABASE_NAME.test(databaseName)) {
    throw new Error('Database safety stop: only a verified local database whose name contains test/testing/isolated is allowed.');
  }

  return value;
}

function resolveLocalApiBaseUrl(env = process.env) {
  const value = env.API_BASE_URL || 'http://localhost:8080/api';
  const parsed = new URL(value);
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) {
    throw new Error('API safety stop: Phase 4-A database E2E may call only a local API.');
  }
  return value;
}

if (require.main === module) {
  const value = resolveIsolatedDatabaseUrl();
  const parsed = new URL(value);
  console.log(`Isolated database safety: PASS (host=${parsed.hostname}, db=${decodeURIComponent(parsed.pathname.slice(1))})`);
}

module.exports = { resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl };
