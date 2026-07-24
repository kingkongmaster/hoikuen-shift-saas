ALTER TABLE "TenantShiftSetting"
  ADD COLUMN "saturdayMinimumStaff" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "TenantShiftSetting"
  ALTER COLUMN "defaultStartNormal" SET DEFAULT '08:30',
  ALTER COLUMN "defaultEndNormal" SET DEFAULT '17:00',
  ALTER COLUMN "defaultStartLate" SET DEFAULT '11:00',
  ALTER COLUMN "defaultEndLate" SET DEFAULT '19:30';

UPDATE "TenantShiftSetting"
SET
  "defaultStartNormal" = CASE WHEN "defaultStartNormal" = '09:00' THEN '08:30' ELSE "defaultStartNormal" END,
  "defaultEndNormal" = CASE WHEN "defaultEndNormal" = '18:00' THEN '17:00' ELSE "defaultEndNormal" END,
  "defaultStartLate" = CASE WHEN "defaultStartLate" = '10:30' THEN '11:00' ELSE "defaultStartLate" END,
  "defaultEndLate" = CASE WHEN "defaultEndLate" = '20:00' THEN '19:30' ELSE "defaultEndLate" END;
