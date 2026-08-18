CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "StaffWorkContract" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "annualizedTargetMinutes" INTEGER NOT NULL,
  "prescribedDailyMinutes" INTEGER NOT NULL,
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffWorkContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffWorkContract_effective_period_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo"),
  CONSTRAINT "StaffWorkContract_annualized_target_check" CHECK ("annualizedTargetMinutes" > 0),
  CONSTRAINT "StaffWorkContract_prescribed_daily_check" CHECK ("prescribedDailyMinutes" > 0),
  CONSTRAINT "StaffWorkContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffWorkContract_tenantId_staffId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StaffWorkContract_tenantId_staffId_effectiveFrom_idx"
  ON "StaffWorkContract"("tenantId", "staffId", "effectiveFrom");
CREATE INDEX "StaffWorkContract_tenantId_voidedAt_idx"
  ON "StaffWorkContract"("tenantId", "voidedAt");

ALTER TABLE "StaffWorkContract"
  ADD CONSTRAINT "StaffWorkContract_no_active_period_overlap"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
  ) WHERE ("voidedAt" IS NULL);
