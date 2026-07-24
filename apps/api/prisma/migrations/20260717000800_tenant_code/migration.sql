ALTER TABLE "Tenant" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");
