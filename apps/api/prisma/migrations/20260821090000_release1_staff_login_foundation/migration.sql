BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower("email") FROM "User"
    GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'RELEASE1_LOGIN_ID_CASE_COLLISION: lowercase email collision requires human resolution';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Staff" s
    LEFT JOIN "Membership" m ON m."tenantId" = s."tenantId" AND m."userId" = s."userId"
    WHERE s."userId" IS NOT NULL AND m."userId" IS NULL
  ) THEN
    RAISE EXCEPTION 'RELEASE1_STAFF_MEMBERSHIP_MISMATCH: linked Staff requires a same-tenant Membership';
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN "loginId" TEXT;
UPDATE "User" SET "loginId" = lower("email");
ALTER TABLE "User" ALTER COLUMN "loginId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "loginId" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
ALTER TABLE "Membership" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Staff" ADD CONSTRAINT "Staff_tenantId_userId_fkey"
FOREIGN KEY ("tenantId", "userId") REFERENCES "Membership"("tenantId", "userId")
ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
