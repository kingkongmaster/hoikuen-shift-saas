ALTER TABLE "ShiftAssignment" ADD COLUMN "assignedClass" "AssignedClass";

CREATE TABLE "TenantShiftSetting" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "weekdayEarlyRequired" INTEGER NOT NULL DEFAULT 2, "weekdayLateRequired" INTEGER NOT NULL DEFAULT 2, "saturdayEarlyRequired" INTEGER NOT NULL DEFAULT 2, "saturdayLateRequired" INTEGER NOT NULL DEFAULT 2, "sundayOperationEnabled" BOOLEAN NOT NULL DEFAULT false, "maxConsecutiveWorkDays" INTEGER NOT NULL DEFAULT 6, "maxConsecutiveEarlyDays" INTEGER NOT NULL DEFAULT 1, "maxConsecutiveLateDays" INTEGER NOT NULL DEFAULT 1, "defaultStartEarly" TEXT NOT NULL DEFAULT '07:00', "defaultEndEarly" TEXT NOT NULL DEFAULT '16:00', "defaultStartNormal" TEXT NOT NULL DEFAULT '09:00', "defaultEndNormal" TEXT NOT NULL DEFAULT '18:00', "defaultStartLate" TEXT NOT NULL DEFAULT '10:30', "defaultEndLate" TEXT NOT NULL DEFAULT '20:00', "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 60, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantShiftSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantShiftSetting_tenantId_key" ON "TenantShiftSetting"("tenantId");
ALTER TABLE "TenantShiftSetting" ADD CONSTRAINT "TenantShiftSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClassStaffingRequirement" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "classType" "AssignedClass" NOT NULL, "weekdayRequired" INTEGER NOT NULL DEFAULT 0, "saturdayRequired" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassStaffingRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassStaffingRequirement_tenantId_classType_key" ON "ClassStaffingRequirement"("tenantId", "classType");
CREATE INDEX "ClassStaffingRequirement_tenantId_isActive_idx" ON "ClassStaffingRequirement"("tenantId", "isActive");
ALTER TABLE "ClassStaffingRequirement" ADD CONSTRAINT "ClassStaffingRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantClosedDate" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "closedDate" DATE NOT NULL, "name" TEXT NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantClosedDate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantClosedDate_tenantId_closedDate_key" ON "TenantClosedDate"("tenantId", "closedDate");
CREATE INDEX "TenantClosedDate_tenantId_closedDate_idx" ON "TenantClosedDate"("tenantId", "closedDate");
ALTER TABLE "TenantClosedDate" ADD CONSTRAINT "TenantClosedDate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
