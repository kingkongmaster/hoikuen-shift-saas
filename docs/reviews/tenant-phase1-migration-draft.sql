-- REVIEW DRAFT — EXECUTION IS PROHIBITED.
-- DO NOT RUN THIS FILE AGAINST ANY DATABASE.
-- NOT A PRISMA MIGRATION. NOT APPROVED FOR ISOLATED, STAGING, OR PRODUCTION USE.
-- Production DB access is explicitly prohibited. Human review and a separate
-- implementation approval are required before adapting any statement below.
--
-- psql hard stop: this file intentionally exits before every SQL statement.
\echo 'STOP: tenant-phase1-migration-draft.sql is review-only and must not be executed.'
\quit

-- ============================================================================
-- Proposed Phase 1 order (unreachable review text below the hard stop)
-- Baseline schema: commit 27bb1c8, Prisma 6.16.1, PostgreSQL
-- ============================================================================

-- STEP 0 — Preconditions (operations checklist, not SQL in this draft)
-- 1. Pin reviewed Git commit and migration artifact hash.
-- 2. Obtain human authorization for the specific isolated/staging environment.
-- 3. Run ops/audits/tenant-integrity-readonly.sql and require PASS.
-- 4. Verify backups/rollback plan for any future production operation.

-- STEP 1 — Parent composite candidate keys.
-- These UNIQUE constraints create the indexes required by composite FKs.
ALTER TABLE "MonthlyShift"
  ADD CONSTRAINT "MonthlyShift_tenantId_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "Staff"
  ADD CONSTRAINT "Staff_tenantId_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "WorkPattern"
  ADD CONSTRAINT "WorkPattern_tenantId_id_key" UNIQUE ("tenantId", "id");

-- STEP 2 — Child indexes not already covered by a leftmost tenant/id prefix.
-- Existing indexes already cover ShiftAssignment.staff, ShiftAssignment.workPattern,
-- ShiftRequest.staff and StaffWorkRule.staff.
CREATE INDEX "ShiftAssignment_tenantId_monthlyShiftId_idx"
  ON "ShiftAssignment" ("tenantId", "monthlyShiftId");

CREATE INDEX "StaffWorkRule_tenantId_workPatternId_idx"
  ON "StaffWorkRule" ("tenantId", "workPatternId");

-- STEP 3 — Add composite tenant-guard FKs while legacy FKs still coexist.
-- NOT VALID enforces each new rule for new/updated rows while deferring the scan of
-- existing rows. Whether to retain NOT VALID in the final artifact is conditional
-- on staging table-size and lock measurements. For a small isolated DB, ordinary
-- validated ADD CONSTRAINT may be simpler.
ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_monthlyShiftId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "monthlyShiftId")
  REFERENCES "MonthlyShift" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;

-- Human approval required: RESTRICT is proposed instead of the legacy SET NULL.
-- The supported API performs logical deactivation and never physical deletion.
-- RESTRICT prevents a direct delete from erasing a confirmed shift's WorkPattern link.
ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_workPatternId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "workPatternId")
  REFERENCES "WorkPattern" ("tenantId", "id")
  MATCH SIMPLE
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "ShiftRequest"
  ADD CONSTRAINT "ShiftRequest_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "StaffWorkRule"
  ADD CONSTRAINT "StaffWorkRule_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "StaffWorkRule"
  ADD CONSTRAINT "StaffWorkRule_tenantId_workPatternId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "workPatternId")
  REFERENCES "WorkPattern" ("tenantId", "id")
  MATCH SIMPLE
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;

-- MATCH SIMPLE means workPatternId = NULL is valid even though tenantId is non-null.

-- STEP 4 — Validate after the read-only audit and cross-tenant negative tests pass.
ALTER TABLE "ShiftAssignment"
  VALIDATE CONSTRAINT "ShiftAssignment_tenantId_monthlyShiftId_tenant_guard_fkey";
ALTER TABLE "ShiftAssignment"
  VALIDATE CONSTRAINT "ShiftAssignment_tenantId_staffId_tenant_guard_fkey";
ALTER TABLE "ShiftAssignment"
  VALIDATE CONSTRAINT "ShiftAssignment_tenantId_workPatternId_tenant_guard_fkey";
ALTER TABLE "ShiftRequest"
  VALIDATE CONSTRAINT "ShiftRequest_tenantId_staffId_tenant_guard_fkey";
ALTER TABLE "StaffWorkRule"
  VALIDATE CONSTRAINT "StaffWorkRule_tenantId_staffId_tenant_guard_fkey";
ALTER TABLE "StaffWorkRule"
  VALIDATE CONSTRAINT "StaffWorkRule_tenantId_workPatternId_tenant_guard_fkey";

-- STEP 5 — Compatibility window.
-- Keep these legacy constraints during initial rollout:
--   ShiftAssignment_monthlyShiftId_fkey
--   ShiftAssignment_staffId_fkey
--   ShiftAssignment_workPatternId_fkey
--   ShiftRequest_staffId_fkey
--   StaffWorkRule_staffId_fkey
--   StaffWorkRule_workPatternId_fkey
-- Run Prisma validation/client generation, API tests, direct DB tests, regression,
-- integrity audit and query/write performance review before any cleanup.

-- STEP 6 — FUTURE CLEANUP ONLY. DO NOT INCLUDE IN FIRST DEPLOYMENT.
-- The following statements remain commented out intentionally. Execute only in a
-- separately reviewed migration after all composite FKs are VALID and application
-- relation metadata uses the composite definitions.
--
-- ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_monthlyShiftId_fkey";
-- ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_staffId_fkey";
-- ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_workPatternId_fkey";
-- ALTER TABLE "ShiftRequest" DROP CONSTRAINT "ShiftRequest_staffId_fkey";
-- ALTER TABLE "StaffWorkRule" DROP CONSTRAINT "StaffWorkRule_staffId_fkey";
-- ALTER TABLE "StaffWorkRule" DROP CONSTRAINT "StaffWorkRule_workPatternId_fkey";

-- ROLLBACK DURING COEXISTENCE (review outline; not executable here):
-- 1. Drop the six *_tenant_guard_fkey constraints.
-- 2. Drop the two new child indexes if no query depends on them.
-- 3. Drop the three parent composite UNIQUE constraints after dependent FKs are gone.
-- 4. Keep legacy FKs and the existing application schema active.
-- No business-data rewrite is part of rollback.

