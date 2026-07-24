CREATE TYPE "NotificationType" AS ENUM ('SHIFT_CONFIRMED', 'SHIFT_UPDATED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'SHIFT_SWAP_REQUEST', 'SHIFT_SWAP_APPROVED', 'SHIFT_SWAP_REJECTED', 'SYSTEM');
CREATE TYPE "ShiftSwapStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Notification" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "memberId" UUID NOT NULL, "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL, "message" TEXT NOT NULL, "isRead" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_tenantId_memberId_isRead_createdAt_idx" ON "Notification"("tenantId", "memberId", "isRead", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShiftSwapRequest" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "requesterId" UUID NOT NULL, "targetMemberId" UUID NOT NULL,
  "requestDate" DATE NOT NULL, "status" "ShiftSwapStatus" NOT NULL DEFAULT 'PENDING', "requestComment" TEXT, "adminComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShiftSwapRequest_tenantId_requesterId_createdAt_idx" ON "ShiftSwapRequest"("tenantId", "requesterId", "createdAt");
CREATE INDEX "ShiftSwapRequest_tenantId_targetMemberId_status_idx" ON "ShiftSwapRequest"("tenantId", "targetMemberId", "status");
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "memberId" UUID NOT NULL, "action" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "detail" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");
CREATE INDEX "AuditLog_tenantId_memberId_createdAt_idx" ON "AuditLog"("tenantId", "memberId", "createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
