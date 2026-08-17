-- Phase 1 tenant database defense.
-- Keep the legacy single-column foreign keys during the compatibility window.

-- Parent candidate keys required by the composite foreign keys.
ALTER TABLE "MonthlyShift"
  ADD CONSTRAINT "MonthlyShift_tenantId_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "Staff"
  ADD CONSTRAINT "Staff_tenantId_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "WorkPattern"
  ADD CONSTRAINT "WorkPattern_tenantId_id_key" UNIQUE ("tenantId", "id");

-- Child indexes not already covered by an existing tenant/id prefix.
CREATE INDEX "ShiftAssignment_tenantId_monthlyShiftId_idx"
  ON "ShiftAssignment" ("tenantId", "monthlyShiftId");

CREATE INDEX "StaffWorkRule_tenantId_workPatternId_idx"
  ON "StaffWorkRule" ("tenantId", "workPatternId");

-- Composite tenant-guard foreign keys. These are validated immediately in the
-- isolated/staging path; NOT VALID is intentionally not used for Phase 1.
ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_monthlyShiftId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "monthlyShiftId")
  REFERENCES "MonthlyShift" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_tenantId_workPatternId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "workPatternId")
  REFERENCES "WorkPattern" ("tenantId", "id")
  MATCH SIMPLE
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftRequest"
  ADD CONSTRAINT "ShiftRequest_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffWorkRule"
  ADD CONSTRAINT "StaffWorkRule_tenantId_staffId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "staffId")
  REFERENCES "Staff" ("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffWorkRule"
  ADD CONSTRAINT "StaffWorkRule_tenantId_workPatternId_tenant_guard_fkey"
  FOREIGN KEY ("tenantId", "workPatternId")
  REFERENCES "WorkPattern" ("tenantId", "id")
  MATCH SIMPLE
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deliberately retained legacy foreign keys:
-- ShiftAssignment_monthlyShiftId_fkey
-- ShiftAssignment_staffId_fkey
-- ShiftAssignment_workPatternId_fkey
-- ShiftRequest_staffId_fkey
-- StaffWorkRule_staffId_fkey
-- StaffWorkRule_workPatternId_fkey
