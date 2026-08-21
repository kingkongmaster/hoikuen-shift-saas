-- CreateEnum
CREATE TYPE "PaidLeaveGrantSource" AS ENUM ('NORMAL_GRANT', 'INITIAL_BALANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaidLeaveUsageUnit" AS ENUM ('DAY', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "PaidLeaveUsageStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED', 'CORRECTED');

-- CreateTable
CREATE TABLE "PaidLeaveGrant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "grantDate" DATE NOT NULL,
    "validFrom" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "grantedHalfDays" INTEGER NOT NULL,
    "source" "PaidLeaveGrantSource" NOT NULL,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" UUID,
    "voidReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaidLeaveGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaidLeaveUsage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "usageDate" DATE NOT NULL,
    "unit" "PaidLeaveUsageUnit" NOT NULL,
    "usedHalfDays" INTEGER NOT NULL,
    "status" "PaidLeaveUsageStatus" NOT NULL DEFAULT 'PROPOSED',
    "shiftRequestId" UUID,
    "shiftAssignmentId" UUID,
    "confirmedByUserId" UUID,
    "confirmedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "cancellationReason" TEXT,
    "cancelledByUserId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "correctedByUserId" UUID,
    "correctedAt" TIMESTAMP(3),
    "supersededById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaidLeaveUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaidLeaveAllocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "usageId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "allocatedHalfDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaidLeaveAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaidLeaveGrant_tenantId_staffId_validFrom_expiresAt_idx" ON "PaidLeaveGrant"("tenantId", "staffId", "validFrom", "expiresAt");

-- CreateIndex
CREATE INDEX "PaidLeaveGrant_tenantId_voidedAt_idx" ON "PaidLeaveGrant"("tenantId", "voidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaidLeaveGrant_tenantId_id_key" ON "PaidLeaveGrant"("tenantId", "id");

-- Values are stored in integer half-day units: one day = 2, half day = 1.
ALTER TABLE "PaidLeaveGrant"
  ADD CONSTRAINT "PaidLeaveGrant_positive_half_days_check" CHECK ("grantedHalfDays" > 0),
  ADD CONSTRAINT "PaidLeaveGrant_valid_period_check" CHECK ("validFrom" <= "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaidLeaveUsage_tenantId_supersededById_key" ON "PaidLeaveUsage"("tenantId", "supersededById");

-- CreateIndex
CREATE INDEX "PaidLeaveUsage_tenantId_staffId_usageDate_status_idx" ON "PaidLeaveUsage"("tenantId", "staffId", "usageDate", "status");

-- CreateIndex
CREATE INDEX "PaidLeaveUsage_tenantId_shiftRequestId_idx" ON "PaidLeaveUsage"("tenantId", "shiftRequestId");

-- CreateIndex
CREATE INDEX "PaidLeaveUsage_tenantId_shiftAssignmentId_idx" ON "PaidLeaveUsage"("tenantId", "shiftAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaidLeaveUsage_tenantId_id_key" ON "PaidLeaveUsage"("tenantId", "id");

ALTER TABLE "PaidLeaveUsage"
  ADD CONSTRAINT "PaidLeaveUsage_unit_amount_check" CHECK (("unit" = 'DAY' AND "usedHalfDays" = 2) OR ("unit" = 'HALF_DAY' AND "usedHalfDays" = 1)),
  ADD CONSTRAINT "PaidLeaveUsage_confirmation_check" CHECK (("status" = 'PROPOSED' AND "confirmedByUserId" IS NULL AND "confirmedAt" IS NULL) OR ("status" <> 'PROPOSED' AND "confirmedByUserId" IS NOT NULL AND "confirmedAt" IS NOT NULL));

-- Only human-confirmed rows reserve an external source. Proposals never block or consume it.
CREATE UNIQUE INDEX "PaidLeaveUsage_confirmed_shiftRequestId_key"
  ON "PaidLeaveUsage"("tenantId", "shiftRequestId")
  WHERE "status" = 'CONFIRMED' AND "shiftRequestId" IS NOT NULL;
CREATE UNIQUE INDEX "PaidLeaveUsage_confirmed_shiftAssignmentId_key"
  ON "PaidLeaveUsage"("tenantId", "shiftAssignmentId")
  WHERE "status" = 'CONFIRMED' AND "shiftAssignmentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "PaidLeaveAllocation_tenantId_grantId_idx" ON "PaidLeaveAllocation"("tenantId", "grantId");

-- CreateIndex
CREATE INDEX "PaidLeaveAllocation_tenantId_usageId_idx" ON "PaidLeaveAllocation"("tenantId", "usageId");

-- CreateIndex
CREATE UNIQUE INDEX "PaidLeaveAllocation_usageId_grantId_key" ON "PaidLeaveAllocation"("usageId", "grantId");

ALTER TABLE "PaidLeaveAllocation"
  ADD CONSTRAINT "PaidLeaveAllocation_positive_half_days_check" CHECK ("allocatedHalfDays" > 0);

-- Composite candidate keys used by tenant-guard foreign keys.
CREATE UNIQUE INDEX "ShiftRequest_tenantId_id_key" ON "ShiftRequest"("tenantId", "id");
CREATE UNIQUE INDEX "ShiftAssignment_tenantId_id_key" ON "ShiftAssignment"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "PaidLeaveGrant" ADD CONSTRAINT "PaidLeaveGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveGrant" ADD CONSTRAINT "PaidLeaveGrant_tenantId_staffId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveUsage" ADD CONSTRAINT "PaidLeaveUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveUsage" ADD CONSTRAINT "PaidLeaveUsage_tenantId_staffId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Optional source links are also tenant guarded.
ALTER TABLE "PaidLeaveUsage" ADD CONSTRAINT "PaidLeaveUsage_tenantId_shiftRequestId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "shiftRequestId") REFERENCES "ShiftRequest"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaidLeaveUsage" ADD CONSTRAINT "PaidLeaveUsage_tenantId_shiftAssignmentId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "shiftAssignmentId") REFERENCES "ShiftAssignment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveUsage" ADD CONSTRAINT "PaidLeaveUsage_tenantId_supersededById_tenant_guard_fkey" FOREIGN KEY ("tenantId", "supersededById") REFERENCES "PaidLeaveUsage"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveAllocation" ADD CONSTRAINT "PaidLeaveAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveAllocation" ADD CONSTRAINT "PaidLeaveAllocation_tenantId_usageId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "usageId") REFERENCES "PaidLeaveUsage"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidLeaveAllocation" ADD CONSTRAINT "PaidLeaveAllocation_tenantId_grantId_tenant_guard_fkey" FOREIGN KEY ("tenantId", "grantId") REFERENCES "PaidLeaveGrant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
