ALTER TABLE "TenantShiftSetting"
  ADD COLUMN "directorCountsTowardStaffing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "directorClassPlacementMode" TEXT NOT NULL DEFAULT 'NONE';
