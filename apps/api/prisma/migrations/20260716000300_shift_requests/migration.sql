CREATE TYPE "ShiftRequestType" AS ENUM ('DAY_OFF', 'PAID_LEAVE', 'SUMMER_LEAVE', 'BEREAVEMENT', 'HALF_DAY_AM', 'HALF_DAY_PM', 'OTHER');
CREATE TYPE "ShiftRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ShiftRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "requestDate" DATE NOT NULL,
  "requestType" "ShiftRequestType" NOT NULL,
  "status" "ShiftRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "adminComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftRequest_tenantId_staffId_requestDate_requestType_key"
  ON "ShiftRequest"("tenantId", "staffId", "requestDate", "requestType");
CREATE INDEX "ShiftRequest_tenantId_requestDate_status_idx"
  ON "ShiftRequest"("tenantId", "requestDate", "status");
CREATE INDEX "ShiftRequest_tenantId_staffId_requestDate_idx"
  ON "ShiftRequest"("tenantId", "staffId", "requestDate");

ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
