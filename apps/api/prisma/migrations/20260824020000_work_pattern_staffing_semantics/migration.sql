ALTER TABLE "WorkPattern"
ADD COLUMN "countsTowardStaffing" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "StaffWorkRuleType" ADD VALUE 'MAX_WORK_PATTERN_PER_MONTH';

UPDATE "WorkPattern"
SET "countsTowardStaffing" = false
WHERE "code" = 'OFF';
