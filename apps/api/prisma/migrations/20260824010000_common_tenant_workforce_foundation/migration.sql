-- Common tenant workforce foundation. No nursery or person names are stored here.

CREATE UNIQUE INDEX "StaffAttributeDefinition_tenantId_id_key"
  ON "StaffAttributeDefinition"("tenantId", "id");

ALTER TABLE "StaffAttributeAssignment"
  DROP CONSTRAINT "StaffAttributeAssignment_staffId_fkey",
  DROP CONSTRAINT "StaffAttributeAssignment_attributeDefinitionId_fkey";
ALTER TABLE "StaffAttributeAssignment"
  ADD CONSTRAINT "StaffAttributeAssignment_tenantId_staffId_tenant_guard_fkey"
    FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StaffAttrAssign_tenant_attribute_guard_fkey"
    FOREIGN KEY ("tenantId", "attributeDefinitionId") REFERENCES "StaffAttributeDefinition"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftStaffingRequirement" ADD COLUMN "workPatternId" UUID;
ALTER TABLE "ShiftStaffingRequirement"
  DROP CONSTRAINT "ShiftStaffingRequirement_attributeDefinitionId_fkey";
ALTER TABLE "ShiftStaffingRequirement"
  ADD CONSTRAINT "ShiftStaffReq_tenant_attribute_guard_fkey"
    FOREIGN KEY ("tenantId", "attributeDefinitionId") REFERENCES "StaffAttributeDefinition"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ShiftStaffReq_tenant_pattern_guard_fkey"
    FOREIGN KEY ("tenantId", "workPatternId") REFERENCES "WorkPattern"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ShiftStaffingRequirement_tenantId_workPatternId_isActive_idx"
  ON "ShiftStaffingRequirement"("tenantId", "workPatternId", "isActive");

CREATE TABLE "Department" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Department_displayOrder_check" CHECK ("displayOrder" >= 0)
);
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");
CREATE UNIQUE INDEX "Department_tenantId_id_key" ON "Department"("tenantId", "id");
CREATE INDEX "Department_tenantId_isActive_displayOrder_idx" ON "Department"("tenantId", "isActive", "displayOrder");
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StaffDepartmentAssignment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "departmentId" UUID NOT NULL,
  "startDate" DATE,
  "endDate" DATE,
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffDepartmentAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffDepartmentAssignment_period_check" CHECK (("startDate" IS NULL AND "endDate" IS NULL) OR ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "startDate" <= "endDate"))
);
CREATE INDEX "StaffDepartmentAssignment_tenantId_staffId_isActive_idx" ON "StaffDepartmentAssignment"("tenantId", "staffId", "isActive");
CREATE INDEX "StaffDepartmentAssignment_tenantId_departmentId_isActive_idx" ON "StaffDepartmentAssignment"("tenantId", "departmentId", "isActive");
ALTER TABLE "StaffDepartmentAssignment" ADD CONSTRAINT "StaffDepartmentAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffDepartmentAssignment" ADD CONSTRAINT "StaffDepartmentAssignment_tenantId_staffId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffDepartmentAssignment" ADD CONSTRAINT "StaffDeptAssign_tenant_department_guard_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "Department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConditionalShiftStaffingRequirement" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "triggerAttributeDefinitionId" UUID NOT NULL,
  "triggerWorkPatternId" UUID NOT NULL,
  "triggerCount" INTEGER NOT NULL,
  "targetAttributeDefinitionId" UUID NOT NULL,
  "targetWorkPatternId" UUID NOT NULL,
  "requiredCount" INTEGER NOT NULL,
  "dayOfWeek" INTEGER,
  "startDate" DATE,
  "endDate" DATE,
  "constraintLevel" "StaffingConstraintLevel" NOT NULL,
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConditionalShiftStaffingRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConditionalShiftStaffingRequirement_count_check" CHECK ("triggerCount" > 0 AND "requiredCount" > 0),
  CONSTRAINT "ConditionalShiftStaffingRequirement_day_check" CHECK ("dayOfWeek" IS NULL OR "dayOfWeek" BETWEEN 0 AND 6),
  CONSTRAINT "ConditionalShiftStaffingRequirement_period_check" CHECK (("startDate" IS NULL AND "endDate" IS NULL) OR ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "startDate" <= "endDate"))
);
CREATE UNIQUE INDEX "ConditionalShiftStaffingRequirement_tenantId_code_key" ON "ConditionalShiftStaffingRequirement"("tenantId", "code");
CREATE INDEX "ConditionalShiftStaffingRequirement_tenantId_isActive_idx" ON "ConditionalShiftStaffingRequirement"("tenantId", "isActive");
CREATE INDEX "ConditionalShiftStaffingRequirement_trigger_idx" ON "ConditionalShiftStaffingRequirement"("tenantId", "triggerAttributeDefinitionId", "triggerWorkPatternId");
CREATE INDEX "ConditionalShiftStaffingRequirement_target_idx" ON "ConditionalShiftStaffingRequirement"("tenantId", "targetAttributeDefinitionId", "targetWorkPatternId");
ALTER TABLE "ConditionalShiftStaffingRequirement" ADD CONSTRAINT "ConditionalShiftStaffingRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConditionalShiftStaffingRequirement" ADD CONSTRAINT "Conditional_trigger_attribute_guard_fkey" FOREIGN KEY ("tenantId", "triggerAttributeDefinitionId") REFERENCES "StaffAttributeDefinition"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConditionalShiftStaffingRequirement" ADD CONSTRAINT "Conditional_trigger_pattern_guard_fkey" FOREIGN KEY ("tenantId", "triggerWorkPatternId") REFERENCES "WorkPattern"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConditionalShiftStaffingRequirement" ADD CONSTRAINT "Conditional_target_attribute_guard_fkey" FOREIGN KEY ("tenantId", "targetAttributeDefinitionId") REFERENCES "StaffAttributeDefinition"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConditionalShiftStaffingRequirement" ADD CONSTRAINT "Conditional_target_pattern_guard_fkey" FOREIGN KEY ("tenantId", "targetWorkPatternId") REFERENCES "WorkPattern"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
