CREATE TYPE "StaffAttributeCategory" AS ENUM ('ROLE', 'QUALIFICATION', 'ASSIGNMENT', 'SKILL');

CREATE TABLE "StaffAttributeDefinition" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "category" "StaffAttributeCategory" NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAttributeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffAttributeAssignment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "attributeDefinitionId" UUID NOT NULL,
  "startDate" DATE,
  "endDate" DATE,
  "notes" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAttributeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffAttributeDefinition_tenantId_code_key" ON "StaffAttributeDefinition"("tenantId", "code");
CREATE INDEX "StaffAttributeDefinition_tenantId_category_isActive_displayOrder_idx" ON "StaffAttributeDefinition"("tenantId", "category", "isActive", "displayOrder");
CREATE INDEX "StaffAttributeAssignment_tenantId_staffId_isActive_idx" ON "StaffAttributeAssignment"("tenantId", "staffId", "isActive");
CREATE INDEX "StaffAttributeAssignment_tenantId_attributeDefinitionId_idx" ON "StaffAttributeAssignment"("tenantId", "attributeDefinitionId");
ALTER TABLE "StaffAttributeDefinition" ADD CONSTRAINT "StaffAttributeDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAttributeAssignment" ADD CONSTRAINT "StaffAttributeAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAttributeAssignment" ADD CONSTRAINT "StaffAttributeAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAttributeAssignment" ADD CONSTRAINT "StaffAttributeAssignment_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "StaffAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
