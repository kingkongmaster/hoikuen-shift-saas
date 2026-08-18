ALTER TABLE "TenantShiftSetting"
  ADD COLUMN "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "TenantShiftSetting"
  ADD CONSTRAINT "TenantShiftSetting_fiscalYearStartMonth_check"
  CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12);
