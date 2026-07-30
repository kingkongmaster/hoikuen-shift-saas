CREATE TABLE "TenantFeature" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "featureCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "configurationVersion" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantFeature_tenantId_featureCode_key" ON "TenantFeature"("tenantId", "featureCode");
CREATE INDEX "TenantFeature_tenantId_enabled_idx" ON "TenantFeature"("tenantId", "enabled");
ALTER TABLE "TenantFeature" ADD CONSTRAINT "TenantFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
