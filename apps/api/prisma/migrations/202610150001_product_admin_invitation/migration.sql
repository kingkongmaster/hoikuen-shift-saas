-- Nullable link leaves existing invitations unchanged; no customer data backfill.
ALTER TABLE "Invitation" ADD COLUMN "invitedUserId" UUID;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedUserId_fkey"
  FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
