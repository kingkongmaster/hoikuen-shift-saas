const assert = require('node:assert/strict');
const { resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl } = require('./helpers/isolated-database.cjs');

const isolated = 'postgresql://test:test@127.0.0.1:55439/enshift_phase4a_test';
assert.equal(resolveIsolatedDatabaseUrl({ DATABASE_URL: isolated, TEST_DATABASE_ISOLATED: 'true' }), isolated);
assert.equal(resolveIsolatedDatabaseUrl({ TEST_DATABASE_URL: isolated, TEST_DATABASE_ISOLATED: 'true' }), isolated);
assert.throws(() => resolveIsolatedDatabaseUrl({ DATABASE_URL: isolated }), /safety stop/i);
assert.throws(() => resolveIsolatedDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@db.example.com/prod_test', TEST_DATABASE_ISOLATED: 'true' }), /safety stop/i);
assert.throws(() => resolveIsolatedDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@localhost/enshift', TEST_DATABASE_ISOLATED: 'true' }), /safety stop/i);
assert.throws(() => resolveIsolatedDatabaseUrl({ DATABASE_URL: isolated, TEST_DATABASE_URL: 'postgresql://test:test@127.0.0.1:55439/other_test', TEST_DATABASE_ISOLATED: 'true' }), /safety stop/i);
assert.equal(resolveLocalApiBaseUrl({ API_BASE_URL: 'http://127.0.0.1:18084/api' }), 'http://127.0.0.1:18084/api');
assert.throws(() => resolveLocalApiBaseUrl({ API_BASE_URL: 'https://api.example.com/api' }), /safety stop/i);
console.log('Isolated database safety guard: PASS');
