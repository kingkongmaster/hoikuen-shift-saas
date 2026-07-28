const assert = require('node:assert/strict');
require('reflect-metadata');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { validateEnvironment } = require('../dist/config/environment.validation');
const { ReadinessController } = require('../dist/presentation/health/readiness.controller');
const { RequestContextMiddleware } = require('../dist/infrastructure/http/request-context.middleware');
const { AuthRateLimitMiddleware } = require('../dist/infrastructure/http/auth-rate-limit.middleware');
const { redactSecrets } = require('../dist/infrastructure/logging/production-json.logger');
const { configuredOrigins, isOriginAllowed } = require('../dist/infrastructure/http/cors-origin');

const base = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://hidden', JWT_SECRET: 'Strong-Production-Secret-1234567890-ABCDEFGHIJKLMN!', JWT_EXPIRES_IN: '8h', WEB_ORIGIN: 'https://staging.example.jp', DEPLOYMENT_ENV: 'staging', TRUST_PROXY: '1', LOG_LEVEL: 'log' };
assert.throws(() => validateEnvironment({ ...base, WEB_ORIGIN: undefined }), /WEB_ORIGIN is required/);
assert.throws(() => validateEnvironment({ ...base, JWT_SECRET: 'weak-secret' }), /minimum strength/);
assert.doesNotThrow(() => validateEnvironment({ ...base, JWT_SECRET: '0123456789abcdef'.repeat(4) }));
assert.throws(() => validateEnvironment({ ...base, WEB_ORIGIN: 'http://localhost:8080' }), /non-local|HTTPS/);
assert.throws(() => validateEnvironment({ ...base, WEB_ORIGIN: 'https://staging.example.jp/path' }), /origins without/);
assert.throws(() => validateEnvironment({ ...base, NODE_ENV: ' Production ' }), /exactly production/);
assert.throws(() => validateEnvironment({ ...base, NODE_ENV: 'development', DEPLOYMENT_ENV: 'production' }), /exactly production/);
assert.doesNotThrow(() => validateEnvironment(base));
assert.doesNotThrow(() => validateEnvironment({ DATABASE_URL: 'postgresql://dev', JWT_SECRET: 'x'.repeat(32) }));

(async () => {
  assert.deepEqual(await new ReadinessController({ ping: async () => true }).getReadiness(), { status: 'ready', database: 'up' });
  await assert.rejects(() => new ReadinessController({ ping: async () => false }).getReadiness(), (error) => error.getStatus() === 503 && !JSON.stringify(error.getResponse()).includes('postgresql'));

  const previousNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const origins = configuredOrigins(' https://one.example.jp,https://two.example.jp ');
  assert.equal(isOriginAllowed('https://one.example.jp', origins), true);
  assert.equal(isOriginAllowed('https://evil.example.jp', origins), false);
  assert.equal(isOriginAllowed(undefined, origins), true);
  process.env.NODE_ENV = previousNodeEnvironment;

  const headers = {};
  const listeners = {};
  const request = { method: 'GET', path: '/api/health', user: undefined };
  const response = { statusCode: 200, setHeader: (key, value) => { headers[key] = value; }, on: (name, callback) => { listeners[name] = callback; } };
  new RequestContextMiddleware().use(request, response, () => {});
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(headers['X-Request-Id'], request.requestId);

  process.env.RATE_LIMIT_ENABLED = 'true'; process.env.AUTH_RATE_LIMIT_IP_MAX = '2'; process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX = '2';
  const limiter = new AuthRateLimitMiddleware(); let status; let body;
  const rateRequest = { ip: '127.0.0.1', socket: {}, body: { email: 'user@example.jp' }, requestId: 'id' };
  const rateResponse = { setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; } };
  limiter.use(rateRequest, rateResponse, () => {}); limiter.use(rateRequest, rateResponse, () => {}); limiter.use(rateRequest, rateResponse, () => {});
  assert.equal(status, 429); assert.equal(body.statusCode, 429);
  delete process.env.RATE_LIMIT_ENABLED; delete process.env.AUTH_RATE_LIMIT_IP_MAX; delete process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX;

  process.env.RATE_LIMIT_ENABLED = 'true'; process.env.AUTH_RATE_LIMIT_WINDOW_MS = '1'; process.env.AUTH_RATE_LIMIT_MAX_BUCKETS = '2';
  const boundedLimiter = new AuthRateLimitMiddleware();
  boundedLimiter.use({ ip: '192.0.2.1', socket: {}, body: {} }, rateResponse, () => {});
  boundedLimiter.use({ ip: '192.0.2.2', socket: {}, body: {} }, rateResponse, () => {});
  await new Promise((resolve) => setTimeout(resolve, 5));
  boundedLimiter.use({ ip: '192.0.2.3', socket: {}, body: {} }, rateResponse, () => {});
  assert.ok(boundedLimiter.buckets.size <= 2, 'expired rate-limit buckets are removed and memory is bounded');
  delete process.env.RATE_LIMIT_ENABLED; delete process.env.AUTH_RATE_LIMIT_WINDOW_MS; delete process.env.AUTH_RATE_LIMIT_MAX_BUCKETS;

  const masked = redactSecrets('DATABASE_URL=postgresql://user:pass@host/db Authorization: Bearer abc.def.ghi password=secret');
  assert.equal(masked.includes('user:pass'), false); assert.equal(masked.includes('abc.def.ghi'), false); assert.equal(masked.includes('password=secret'), false);

  const seed = spawnSync(process.execPath, ['prisma/seed.cjs'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', DEPLOYMENT_ENV: 'production' }, encoding: 'utf8' });
  assert.notEqual(seed.status, 0); assert.match(seed.stderr, /disabled in production/);
  const normalizedSeed = spawnSync(process.execPath, ['prisma/seed.cjs'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, NODE_ENV: ' Production ', DEPLOYMENT_ENV: 'staging' }, encoding: 'utf8' });
  assert.notEqual(normalizedSeed.status, 0); assert.match(normalizedSeed.stderr, /disabled in production/);
  const migration = spawnSync(process.execPath, ['scripts/migration.cjs', 'deploy'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, DATABASE_URL: 'postgresql://hidden', DEPLOYMENT_ENV: 'production', DATABASE_TARGET_ID: 'production-primary', CONFIRM_DATABASE_TARGET_ID: 'production-primary', CONFIRM_DEPLOYMENT_ENV: 'production' }, encoding: 'utf8' });
  assert.notEqual(migration.status, 0); assert.match(migration.stderr, /ALLOW_PRODUCTION_MIGRATION/); assert.equal(`${migration.stdout}${migration.stderr}`.includes('postgresql://hidden'), false);
  const normalizedMigration = spawnSync(process.execPath, ['scripts/migration.cjs', 'deploy'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, DATABASE_URL: 'postgresql://hidden', DEPLOYMENT_ENV: ' Production ', DATABASE_TARGET_ID: 'production-primary', CONFIRM_DATABASE_TARGET_ID: 'production-primary', CONFIRM_DEPLOYMENT_ENV: 'production' }, encoding: 'utf8' });
  assert.notEqual(normalizedMigration.status, 0); assert.match(normalizedMigration.stderr, /ALLOW_PRODUCTION_MIGRATION/);

  if (process.env.DATABASE_URL && process.env.SEED_OWNER_EMAIL) {
    const duplicate = spawnSync(process.execPath, ['scripts/bootstrap-admin.cjs'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, DEPLOYMENT_ENV: 'e2e', INITIAL_ADMIN_TENANT_ID: '00000000-0000-4000-8000-000000000001', INITIAL_ADMIN_EMAIL: process.env.SEED_OWNER_EMAIL, INITIAL_ADMIN_PASSWORD: 'Temporary-Not-Printed-123!', INITIAL_ADMIN_DISPLAY_NAME: 'Duplicate Admin' }, encoding: 'utf8' });
    assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /already exists/); assert.equal(`${duplicate.stdout}${duplicate.stderr}`.includes('Temporary-Not-Printed'), false);
    const secondAdministrator = spawnSync(process.execPath, ['scripts/bootstrap-admin.cjs'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, DEPLOYMENT_ENV: 'e2e', INITIAL_ADMIN_TENANT_ID: '00000000-0000-4000-8000-000000000001', INITIAL_ADMIN_EMAIL: 'second-admin@example.invalid', INITIAL_ADMIN_PASSWORD: 'Temporary-Not-Printed-456!', INITIAL_ADMIN_DISPLAY_NAME: 'Second Admin' }, encoding: 'utf8' });
    assert.notEqual(secondAdministrator.status, 0); assert.match(secondAdministrator.stderr, /administrator already exists/); assert.equal(`${secondAdministrator.stdout}${secondAdministrator.stderr}`.includes('Temporary-Not-Printed'), false);
  }

  const mainSource = readFileSync(require.resolve('../src/main.ts'), 'utf8');
  assert.match(mainSource, /enableShutdownHooks\(\['SIGTERM', 'SIGINT'\]\)/);
  assert.match(mainSource, /server\.set\('trust proxy'/);
  assert.match(mainSource, /isOriginAllowed\(origin, origins\)/);
  console.log('Production hardening regression tests: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
