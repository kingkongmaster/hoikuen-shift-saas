ALTER TABLE "StaffWorkContract"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "StaffWorkRule"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesRuleId" UUID;

ALTER TABLE "ShiftStaffingRequirement"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "TenantEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "eventDate" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "targetClasses" JSONB,
  "targetStaffCodes" JSONB,
  "allowedWorkPatternCodes" JSONB,
  "fixedTimeStaffAllowed" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedBy" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantEvent_tenantId_eventDate_name_key" ON "TenantEvent"("tenantId", "eventDate", "name");
CREATE INDEX "TenantEvent_tenantId_eventDate_isActive_idx" ON "TenantEvent"("tenantId", "eventDate", "isActive");

CREATE TABLE "TenantRuleException" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "exceptionDate" DATE NOT NULL,
  "exceptionType" TEXT NOT NULL,
  "configuration" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedBy" TEXT,
  "effectiveFrom" DATE,
  "effectiveTo" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantRuleException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantRuleException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantRuleException_tenantId_exceptionDate_exceptionType_key" ON "TenantRuleException"("tenantId", "exceptionDate", "exceptionType");
CREATE INDEX "TenantRuleException_tenantId_exceptionDate_isActive_idx" ON "TenantRuleException"("tenantId", "exceptionDate", "isActive");
