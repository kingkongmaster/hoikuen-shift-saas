CREATE TYPE "MonthlyShiftStatus" AS ENUM ('DRAFT', 'CONFIRMED');
CREATE TYPE "ShiftType" AS ENUM ('EARLY', 'NORMAL', 'LATE', 'OFF', 'PAID_LEAVE', 'SUMMER_LEAVE', 'AM_HALF', 'PM_HALF', 'OTHER');

CREATE TABLE "MonthlyShift" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "targetMonth" DATE NOT NULL,
  "status" "MonthlyShiftStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" UUID NOT NULL,
  "confirmedByUserId" UUID,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlyShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftAssignment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "monthlyShiftId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "workDate" DATE NOT NULL,
  "shiftType" "ShiftType" NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "breakMinutes" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyShift_tenantId_targetMonth_key" ON "MonthlyShift"("tenantId", "targetMonth");
CREATE INDEX "MonthlyShift_tenantId_status_targetMonth_idx" ON "MonthlyShift"("tenantId", "status", "targetMonth");
CREATE UNIQUE INDEX "ShiftAssignment_monthlyShiftId_staffId_workDate_key" ON "ShiftAssignment"("monthlyShiftId", "staffId", "workDate");
CREATE INDEX "ShiftAssignment_tenantId_staffId_workDate_idx" ON "ShiftAssignment"("tenantId", "staffId", "workDate");
CREATE INDEX "ShiftAssignment_monthlyShiftId_workDate_idx" ON "ShiftAssignment"("monthlyShiftId", "workDate");

ALTER TABLE "MonthlyShift" ADD CONSTRAINT "MonthlyShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_monthlyShiftId_fkey" FOREIGN KEY ("monthlyShiftId") REFERENCES "MonthlyShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
