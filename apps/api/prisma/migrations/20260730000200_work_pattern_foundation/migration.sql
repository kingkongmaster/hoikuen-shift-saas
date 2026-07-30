CREATE TABLE "WorkPattern" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "startTime" TEXT,
    "endTime" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShiftAssignment" ADD COLUMN "workPatternId" UUID;
CREATE UNIQUE INDEX "WorkPattern_tenantId_code_key" ON "WorkPattern"("tenantId", "code");
CREATE INDEX "WorkPattern_tenantId_isActive_displayOrder_idx" ON "WorkPattern"("tenantId", "isActive", "displayOrder");
CREATE INDEX "ShiftAssignment_tenantId_workPatternId_idx" ON "ShiftAssignment"("tenantId", "workPatternId");
ALTER TABLE "WorkPattern" ADD CONSTRAINT "WorkPattern_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "WorkPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;
