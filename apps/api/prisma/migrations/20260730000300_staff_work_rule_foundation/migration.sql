CREATE TYPE "StaffWorkRuleType" AS ENUM (
  'AVAILABLE_WORK_PATTERN', 'UNAVAILABLE_WORK_PATTERN', 'AVAILABLE_DAY_OF_WEEK',
  'UNAVAILABLE_DAY_OF_WEEK', 'AVAILABLE_TIME_RANGE', 'UNAVAILABLE_TIME_RANGE',
  'MAX_WORK_DAYS_PER_WEEK', 'MAX_WORK_DAYS_PER_MONTH', 'MAX_WORK_MINUTES_PER_MONTH',
  'MIN_WORK_DAYS_PER_MONTH', 'MIN_WORK_MINUTES_PER_MONTH', 'MAX_CONSECUTIVE_WORK_DAYS',
  'REQUIRED_DAY_OFF', 'FIXED_WORK_PATTERN', 'PREFERRED_WORK_PATTERN'
);

CREATE TABLE "StaffWorkRule" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "ruleType" "StaffWorkRuleType" NOT NULL,
  "workPatternId" UUID,
  "dayOfWeek" INTEGER,
  "startDate" DATE,
  "endDate" DATE,
  "startTime" TEXT,
  "endTime" TEXT,
  "numericValue" INTEGER,
  "booleanValue" BOOLEAN,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isHardConstraint" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffWorkRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffWorkRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffWorkRule_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffWorkRule_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "WorkPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StaffWorkRule_tenantId_staffId_isActive_idx" ON "StaffWorkRule"("tenantId", "staffId", "isActive");
CREATE INDEX "StaffWorkRule_tenantId_ruleType_idx" ON "StaffWorkRule"("tenantId", "ruleType");
