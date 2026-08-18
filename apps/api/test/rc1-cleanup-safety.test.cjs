const assert = require('node:assert/strict');
const { resolveIsolatedDatabaseUrl } = require('./rc1-shift-display.e2e.cjs');

const local = 'postgresql://test:test@127.0.0.1:55439/test';
assert.equal(resolveIsolatedDatabaseUrl({ DATABASE_URL: local, TEST_DATABASE_ISOLATED: 'true' }), local, 'A: explicit DATABASE_URL');
assert.equal(resolveIsolatedDatabaseUrl({ TEST_DATABASE_URL: local, TEST_DATABASE_ISOLATED: 'true' }), local, 'B: TEST_DATABASE_URL works without caller DATABASE_URL');
assert.throws(() => resolveIsolatedDatabaseUrl({}), /safety stop/, 'C: unresolved destination stops safely');
assert.throws(() => resolveIsolatedDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@db.example.com/prod', TEST_DATABASE_ISOLATED: 'true' }), /only a verified local/, 'C: non-local fallback is rejected');
console.log('RC1 cleanup connection policy tests: PASS (A-C)');
