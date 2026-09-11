# Phase 4 Release Gate implementation — 2026-09-11

> Historical audit checkpoint. Superseded by [final RC1 class audit](rc1-class-audit-20260911.md): PHASE4_RELEASE_GATE_FIX_VERIFIED, API 48/48 PASS. Earlier HOLD findings below are retained as evidence.

Result: **HOLD (one pre-existing RC1 regression remains)**. No commit, push, PR or deployment.

Baseline: `b0c432eb260b89ae533c551404a5266077ef9d24`.
Worktree: `/Users/kojimacair/Desktop/hoikuen-shift-rc-musubi`.
Branch: `codex/musubi-production-provisioning`.
Human authorization: Phase 4 implementation instruction, 2026-09-11. No new Tenant preferences were applied.

## Changes

| Process | Role | Connection | Boundaries |
|---|---|---|---|
| API | aen_app | DATABASE_URL | Business CRUD only; no migration/backup/restore secret |
| migration | aen_migrator | MIGRATION_DATABASE_URL mapped to DATABASE_URL | No JWT |
| operations | aen_app | OPERATIONS_DATABASE_URL mapped to DATABASE_URL | Data operations; no DDL |
| backup | aen_backup | dedicated PGPASSFILE | SELECT only |
| restore | human maintenance role | separately managed | No runtime distribution |
| Web/Caddy | none | none | No DB or JWT secret |

Provisioning SQL removes application CREATE/TEMP and migration-history access. A read-only release-status view exposes only migration names/checksums/completion/rollback timestamps, not migration logs. Operations still compares exact 30 release migrations through that view. No Prisma migration file changed or added. Backup grants target an existing dedicated role; no production credential created.

Beta UI hides backup loading/export/validation/restore preview, feedback JSON download and raw preview. API backups routes deny even ADMIN/DIRECTOR with 403. CSV, print/PDF/B4 remain. Standard release behavior is retained. Web build flag and API RELEASE_CHANNEL are both musubi-beta.

PREFERRED_WORK_PATTERN leakage from P02 to P03 was reproduced before correction. Generic pattern-ID comparison fixes it; it remains SOFT and does not bypass unavailability. No Musubi-specific generator hack. Third-Friday meeting logic remains unchanged; outdated runbook corrected.

BASE_COMMON: preference identity and release guard. TENANT_CONFIG: meeting/fixed/weekly rules. MUSUBI_CUSTOM: existing master package unchanged. INTERNAL_OPERATION: Compose/grants/release attestation. Copyright, trade-secret/fairness and release-signature policy retained; no signing key created.

## Verification

Only new isolated local PG16 was used (loopback, temporary in-memory data volume, no Production DB connection). Synthetic test data only; September FINAL and existing untracked assets untouched.

- 30 migrations on clean PG16: PASS; btree_gist: PASS; migrator deploy: PASS.
- Application SELECT/INSERT/UPDATE/DELETE: PASS.
- App CREATE/ALTER/DROP/schema/TEMP/_prisma_migrations SELECT+DELETE/SET ROLE and migration deploy: rejected as expected.
- Read-only operations attestation with aen_app: PASS; mutation of view denied.
- Backup SELECT: PASS; INSERT/UPDATE/DELETE/CREATE denied; pg_dump exit 0 (discarded, no dump content recorded).
- Resolved Compose credential separation: PASS (placeholders only).
- Beta administrator direct JSON API: 403; unauthenticated: 401. Standard backup API regression: PASS.
- Rendered Beta/standard UI: PASS; JSON hidden only in Beta; CSV and print/B4 retained; FAQ no JSON in Beta.
- P02 preference/P03 non-propagation/both patterns eligible/HARD precedence: PASS.
- Third Friday only, fixed exclusion, unconfigured tenant unaffected: PASS.
- Fixed EARLY/P02, weekly1/shortage2/no auto3, transition block: existing generator suites PASS.
- Three anonymous fixed workers through API: 93 January rows, fixed hours, meeting excluded, no childcare class allocation: PASS.
- Tenant FK/cross-tenant, auth, paid leave, requests, swaps, staff account races: PASS.
- API/Web lint and build (Beta Web build): PASS.
- Web regression chain: PASS, including mobile390, PWA and B4 layout tests. These are automated checks, not new physical Windows/mobile/printer acceptance.
- API regression plus selected related suites: **47/48 commands PASS**, listed below. New release-specific tests also PASS.

## Remaining issue

`test/rc1-shift-display.e2e.cjs:48`: expects 14 × 31 = 434, actual 465. Reproduced against the pre-change SHA using its API source in the same isolated environment. Current context query excludes DIRECTOR; the legacy fixture expects ADMIN exclusion too. The existing assertion/test was left unchanged. A trial of explicit fixture exclusion also reached a later class-assignment expectation mismatch, so this is not safely solved by changing only the count. No business logic was altered to force the test through.

Next bounded step: reconcile this RC1 display fixture with the approved administrator participation/class-assignment specification, then rerun that suite and finalize the Release Gate. Commit is not recommended until resolved.

Other stale tests repaired without changing application policy: weekday fixture replaces a closed Sunday before confirmation; bootstrap test supplies explicit Tenant UUID and --apply; Web source assertion distinguishes React key interpolation from rendered error codes. JWT-dependent tests passed after supplying the isolated runtime's test configuration.

No new Critical/High vulnerability established in this scope. Release verification blocker: one RC1 suite. Existing migration-internal High remains separately managed as an isolated non-blocker; this run is not a new image/CVE scan.

## API command results

- PASS — `node test/helpers/isolated-database.cjs`
- PASS — `node test/staff.e2e.cjs`
- PASS — `node test/requests.e2e.cjs`
- PASS — `node test/shifts.e2e.cjs`
- PASS — `node test/generation.e2e.cjs`
- PASS — `node test/sprint6.e2e.cjs`
- PASS — `node test/sprint7.e2e.cjs`
- PASS — `node test/sprint8.e2e.cjs`
- PASS — `node test/sprint9a1.e2e.cjs`
- PASS — `node test/sprint9a2.e2e.cjs`
- PASS — `node test/sprint9b1a.e2e.cjs`
- PASS — `node test/sprint9b1b.e2e.cjs`
- PASS — `node test/sprint9b1b-final.e2e.cjs`
- PASS — `node test/sprint9c.e2e.cjs`
- PASS — `node test/sprint10a.e2e.cjs`
- FAIL — `node test/rc1-shift-display.e2e.cjs`
- PASS — `node test/rc1-director-rules.test.cjs`
- PASS — `node test/individual-working-hours.test.cjs`
- PASS — `node test/monthly-work-targets.test.cjs`
- PASS — `node test/fair-special-shift-allocation.test.cjs`
- PASS — `node test/fixed-class-special-shift.test.cjs`
- PASS — `node test/production-hardening.test.cjs`
- PASS — `node test/initial-password-change.e2e.cjs`
- PASS — `node test/feature-entitlements.e2e.cjs`
- PASS — `node test/work-patterns.e2e.cjs`
- PASS — `node test/staff-work-rules.e2e.cjs`
- PASS — `node test/staff-attributes.e2e.cjs`
- PASS — `node test/staffing-requirements.e2e.cjs`
- PASS — `node test/annual-fairness-phase1.test.cjs`
- PASS — `node test/annual-work-summaries.e2e.cjs`
- PASS — `node test/annual-target-proration.test.cjs`
- PASS — `node test/staff-work-contracts.e2e.cjs`
- PASS — `node test/paid-leave-timezone.test.cjs`
- PASS — `node test/paid-leave-phase4a.e2e.cjs`
- PASS — `node test/release1-login-migration-safety.e2e.cjs`
- PASS — `node test/release1-staff-account.e2e.cjs`
- PASS — `node test/release1-staff-safety.e2e.cjs`
- PASS — `node test/release1-staff-reactivate-concurrency.e2e.cjs`
- PASS — `node test/release1-staff-limit.e2e.cjs`
- PASS — `node test/weekly-work-pattern-group-limit.test.cjs`
- PASS — `node test/shift-transition-burden.test.cjs`
- PASS — `node test/staff-work-rule-generator.test.cjs`
- PASS — `node test/staffing-requirement-generator.test.cjs`
- PASS — `node test/fixed-assignment-materializer.test.cjs`
- PASS — `node test/tenant-phase1-db-constraints.e2e.cjs`
- PASS — `node test/weekly-rotation-confirm.e2e.cjs`
- PASS — `node test/helpers/isolated-database.cjs && node test/common-workforce-foundation.e2e.cjs`
- PASS — `node test/future-hard-capacity-generator-regression.test.cjs`

## Final workspace check

19 tracked files modified and 12 new task files (including this report); no staged changes. Existing 10 untracked assets were not modified or added. HEAD remains the baseline SHA. `git diff --check` PASS. Targeted private-key/token/credential-URL pattern scan on task files found zero matches; this is not a comprehensive secret scanner. Existing 30 migration files unchanged.

The three local audit API processes were stopped and only the task-owned temporary PG16 container was removed. No existing local containers or persistent volumes were modified. Production and old VPS were never connected during this implementation.
