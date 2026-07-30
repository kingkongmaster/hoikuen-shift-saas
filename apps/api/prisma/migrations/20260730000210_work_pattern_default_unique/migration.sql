CREATE UNIQUE INDEX "WorkPattern_tenantId_active_default_key"
ON "WorkPattern"("tenantId")
WHERE "isDefault" = true AND "isActive" = true;
