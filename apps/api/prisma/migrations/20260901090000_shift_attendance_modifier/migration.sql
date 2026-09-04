CREATE TYPE "AttendanceModifierType" AS ENUM (
  'AM_PAID_LEAVE',
  'PM_PAID_LEAVE',
  'EARLY_DEPARTURE',
  'LATE_ARRIVAL',
  'HOURLY_LEAVE'
);

CREATE TABLE "ShiftAttendanceModifier" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "shiftAssignmentId" UUID NOT NULL,
  "modifierType" "AttendanceModifierType" NOT NULL,
  "effectiveStartTime" TEXT,
  "effectiveEndTime" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftAttendanceModifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftAttendanceModifier_shiftAssignmentId_key"
  ON "ShiftAttendanceModifier"("shiftAssignmentId");
CREATE UNIQUE INDEX "ShiftAttendanceModifier_tenantId_shiftAssignmentId_key"
  ON "ShiftAttendanceModifier"("tenantId", "shiftAssignmentId");
CREATE INDEX "ShiftAttendanceModifier_tenantId_modifierType_idx"
  ON "ShiftAttendanceModifier"("tenantId", "modifierType");

ALTER TABLE "ShiftAttendanceModifier"
  ADD CONSTRAINT "ShiftAttendanceModifier_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAttendanceModifier"
  ADD CONSTRAINT "ShiftAttendanceModifier_tenant_assignment_guard_fkey"
  FOREIGN KEY ("tenantId", "shiftAssignmentId") REFERENCES "ShiftAssignment"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
