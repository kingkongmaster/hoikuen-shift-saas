CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'REEMPLOYED');
CREATE TYPE "AssignedClass" AS ENUM ('AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5', 'FREE', 'SUPPORT');

ALTER TABLE "Staff"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN "assignedClass" "AssignedClass" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "canWorkEarly" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canWorkRegular" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canWorkLate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "earlyShiftOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lateShiftOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canWorkSaturdays" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "monthlyWorkHourLimit" INTEGER,
  ADD COLUMN "weeklyAvailableDays" INTEGER,
  ADD COLUMN "notes" TEXT;

UPDATE "Staff"
SET "employeeNumber" = 'LEGACY-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8))
WHERE "employeeNumber" IS NULL OR BTRIM("employeeNumber") = '';

ALTER TABLE "Staff" ALTER COLUMN "employeeNumber" SET NOT NULL;

CREATE INDEX "Staff_tenantId_displayName_idx" ON "Staff"("tenantId", "displayName");
