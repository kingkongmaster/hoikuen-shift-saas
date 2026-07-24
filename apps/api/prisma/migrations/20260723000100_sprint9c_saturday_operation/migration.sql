ALTER TABLE "TenantShiftSetting"
ADD COLUMN "saturdayOperationEnabled" BOOLEAN;

UPDATE "TenantShiftSetting" AS settings
SET "saturdayOperationEnabled" = (
  settings."saturdayEarlyRequired" > 0
  OR settings."saturdayLateRequired" > 0
  OR EXISTS (
    SELECT 1
    FROM "ClassStaffingRequirement" AS requirements
    WHERE requirements."tenantId" = settings."tenantId"
      AND requirements."saturdayRequired" > 0
  )
);

ALTER TABLE "TenantShiftSetting"
ALTER COLUMN "saturdayOperationEnabled" SET DEFAULT true,
ALTER COLUMN "saturdayOperationEnabled" SET NOT NULL;
