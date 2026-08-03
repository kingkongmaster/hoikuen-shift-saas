-- CreateEnum
CREATE TYPE "StaffingConstraintLevel" AS ENUM ('HARD', 'SOFT', 'INFO');

-- CreateTable
CREATE TABLE "ShiftStaffingRequirement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "classType" "AssignedClass",
    "dayOfWeek" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "requiredCount" INTEGER NOT NULL,
    "constraintLevel" "StaffingConstraintLevel" NOT NULL,
    "reason" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftStaffingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftStaffingRequirement_tenantId_code_key" ON "ShiftStaffingRequirement"("tenantId", "code");
CREATE INDEX "ShiftStaffingRequirement_tenantId_isActive_displayOrder_idx" ON "ShiftStaffingRequirement"("tenantId", "isActive", "displayOrder");
CREATE INDEX "ShiftStaffingRequirement_tenantId_attributeDefinitionId_is_idx" ON "ShiftStaffingRequirement"("tenantId", "attributeDefinitionId", "isActive");
CREATE INDEX "ShiftStaffingRequirement_tenantId_classType_dayOfWeek_isAct_idx" ON "ShiftStaffingRequirement"("tenantId", "classType", "dayOfWeek", "isActive");

-- AddForeignKey
ALTER TABLE "ShiftStaffingRequirement" ADD CONSTRAINT "ShiftStaffingRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftStaffingRequirement" ADD CONSTRAINT "ShiftStaffingRequirement_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "StaffAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
