-- READ ONLY AUDIT — DO NOT MODIFY DATA
-- AeN Shift tenant integrity pre-constraint health check.
-- Source of truth: apps/api/prisma/schema.prisma at commit
-- c6ddb66cfc808f40ca86275d4f9165cd5f5a7a6e
--
-- Run only through the separately approved audit procedure, with a DB role
-- that has SELECT permission only. This file intentionally returns IDs only:
-- no names, email addresses, contact data, credentials, tokens, or secrets.
--
-- Result policy:
--   PASS   = every FAIL check is 0 and no REVIEW item needs escalation.
--   REVIEW = only review-class findings exist and each is explained by policy.
--   FAIL   = any tenant mismatch or mandatory relation orphan is 1 or more.

BEGIN;
SET TRANSACTION READ ONLY;

-- ============================================================================
-- Level 1: count-only health summary
-- ============================================================================

WITH checks(check_name, finding_class, anomaly_count) AS (
  -- ShiftAssignment -> MonthlyShift / Staff / optional WorkPattern
  SELECT 'shift_assignment_monthly_shift_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c JOIN "MonthlyShift" p ON p.id = c."monthlyShiftId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_monthly_shift_orphan', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c LEFT JOIN "MonthlyShift" p ON p.id = c."monthlyShiftId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'shift_assignment_staff_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_staff_orphan', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'shift_assignment_work_pattern_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_work_pattern_orphan', 'FAIL', COUNT(*)
  FROM "ShiftAssignment" c LEFT JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND p.id IS NULL

  -- ShiftRequest -> Staff
  UNION ALL
  SELECT 'shift_request_staff_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "ShiftRequest" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_request_staff_orphan', 'FAIL', COUNT(*)
  FROM "ShiftRequest" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL

  -- StaffWorkRule -> Staff / optional WorkPattern
  UNION ALL
  SELECT 'staff_work_rule_staff_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "StaffWorkRule" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_work_rule_staff_orphan', 'FAIL', COUNT(*)
  FROM "StaffWorkRule" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_work_rule_work_pattern_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "StaffWorkRule" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_work_rule_work_pattern_orphan', 'FAIL', COUNT(*)
  FROM "StaffWorkRule" c LEFT JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND p.id IS NULL

  -- ShiftStaffingRequirement -> StaffAttributeDefinition
  UNION ALL
  SELECT 'shift_staffing_requirement_attribute_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "ShiftStaffingRequirement" c
  JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_staffing_requirement_attribute_orphan', 'FAIL', COUNT(*)
  FROM "ShiftStaffingRequirement" c
  LEFT JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE p.id IS NULL

  -- StaffAttributeAssignment -> Staff / StaffAttributeDefinition
  UNION ALL
  SELECT 'staff_attribute_assignment_staff_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "StaffAttributeAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_attribute_assignment_staff_orphan', 'FAIL', COUNT(*)
  FROM "StaffAttributeAssignment" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_attribute_assignment_definition_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "StaffAttributeAssignment" c
  JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_attribute_assignment_definition_orphan', 'FAIL', COUNT(*)
  FROM "StaffAttributeAssignment" c
  LEFT JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE p.id IS NULL

  -- Staff -> optional User, with same-tenant Membership required when linked.
  -- A User having Membership rows in multiple tenants is intentionally valid.
  UNION ALL
  SELECT 'staff_user_orphan', 'FAIL', COUNT(*)
  FROM "Staff" c LEFT JOIN "User" u ON u.id = c."userId"
  WHERE c."userId" IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'staff_same_tenant_membership_missing', 'FAIL', COUNT(*)
  FROM "Staff" c
  JOIN "User" u ON u.id = c."userId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."userId"
  WHERE c."userId" IS NOT NULL AND m."userId" IS NULL

  -- Notification -> User and same-tenant Membership
  UNION ALL
  SELECT 'notification_member_user_orphan', 'FAIL', COUNT(*)
  FROM "Notification" c LEFT JOIN "User" u ON u.id = c."memberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'notification_same_tenant_membership_missing', 'FAIL', COUNT(*)
  FROM "Notification" c
  JOIN "User" u ON u.id = c."memberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."userId" IS NULL

  -- ShiftSwapRequest -> requester / target User and same-tenant Membership
  UNION ALL
  SELECT 'shift_swap_requester_user_orphan', 'FAIL', COUNT(*)
  FROM "ShiftSwapRequest" c LEFT JOIN "User" u ON u.id = c."requesterId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'shift_swap_requester_membership_missing', 'FAIL', COUNT(*)
  FROM "ShiftSwapRequest" c
  JOIN "User" u ON u.id = c."requesterId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."requesterId"
  WHERE m."userId" IS NULL
  UNION ALL
  SELECT 'shift_swap_target_user_orphan', 'FAIL', COUNT(*)
  FROM "ShiftSwapRequest" c LEFT JOIN "User" u ON u.id = c."targetMemberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'shift_swap_target_membership_missing', 'FAIL', COUNT(*)
  FROM "ShiftSwapRequest" c
  JOIN "User" u ON u.id = c."targetMemberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."targetMemberId"
  WHERE m."userId" IS NULL

  -- Invitation -> optional Staff and creator identity.
  UNION ALL
  SELECT 'invitation_staff_tenant_mismatch', 'FAIL', COUNT(*)
  FROM "Invitation" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."staffId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'invitation_staff_orphan', 'FAIL', COUNT(*)
  FROM "Invitation" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."staffId" IS NOT NULL AND p.id IS NULL
  UNION ALL
  SELECT 'invitation_creator_user_missing', 'REVIEW', COUNT(*)
  FROM "Invitation" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'invitation_creator_authorization_history', 'REVIEW', COUNT(*)
  FROM "Invitation" c
  JOIN "User" u ON u.id = c."createdByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."createdByUserId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE

  -- MonthlyShift creator / confirmer are scalar audit identities in the schema.
  -- Missing current identity or Membership needs historical review, not an
  -- automatic tenant-mismatch conclusion.
  UNION ALL
  SELECT 'monthly_shift_creator_user_missing', 'REVIEW', COUNT(*)
  FROM "MonthlyShift" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'monthly_shift_creator_membership_history', 'REVIEW', COUNT(*)
  FROM "MonthlyShift" c
  JOIN "User" u ON u.id = c."createdByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."createdByUserId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE
  UNION ALL
  SELECT 'monthly_shift_confirmer_user_missing', 'REVIEW', COUNT(*)
  FROM "MonthlyShift" c LEFT JOIN "User" u ON u.id = c."confirmedByUserId"
  WHERE c."confirmedByUserId" IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'monthly_shift_confirmer_membership_history', 'REVIEW', COUNT(*)
  FROM "MonthlyShift" c
  JOIN "User" u ON u.id = c."confirmedByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."confirmedByUserId"
  WHERE c."confirmedByUserId" IS NOT NULL
    AND m."userId" IS NULL
    AND u."isPlatformAdmin" = FALSE

  -- TenantFeature creator can legitimately be a Platform Admin without target
  -- tenant Membership. Only a missing non-null identity needs review.
  UNION ALL
  SELECT 'tenant_feature_creator_user_missing', 'REVIEW', COUNT(*)
  FROM "TenantFeature" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE c."createdByUserId" IS NOT NULL AND u.id IS NULL

  -- AuditLog retains cross-tenant Platform Admin activity. Absence of a current
  -- Membership is therefore review-only. User orphan remains a broken mandatory
  -- relation under the current schema.
  UNION ALL
  SELECT 'audit_log_member_user_orphan', 'FAIL', COUNT(*)
  FROM "AuditLog" c LEFT JOIN "User" u ON u.id = c."memberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'audit_log_actor_membership_history', 'REVIEW', COUNT(*)
  FROM "AuditLog" c
  JOIN "User" u ON u.id = c."memberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE

  -- Inactive references are not orphans. Active child -> inactive parent is
  -- reported separately for business review.
  UNION ALL
  SELECT 'active_staff_rule_inactive_staff', 'REVIEW', COUNT(*)
  FROM "StaffWorkRule" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_staff_rule_inactive_work_pattern', 'REVIEW', COUNT(*)
  FROM "StaffWorkRule" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."isActive" = TRUE AND c."workPatternId" IS NOT NULL AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_staffing_requirement_inactive_attribute', 'REVIEW', COUNT(*)
  FROM "ShiftStaffingRequirement" c
  JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_attribute_assignment_inactive_staff', 'REVIEW', COUNT(*)
  FROM "StaffAttributeAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_attribute_assignment_inactive_definition', 'REVIEW', COUNT(*)
  FROM "StaffAttributeAssignment" c
  JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'notification_inactive_membership_history', 'REVIEW', COUNT(*)
  FROM "Notification" c
  JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."isActive" = FALSE
  UNION ALL
  SELECT 'shift_swap_inactive_membership_history', 'REVIEW', COUNT(*)
  FROM "ShiftSwapRequest" c
  JOIN "Membership" requester ON requester."tenantId" = c."tenantId" AND requester."userId" = c."requesterId"
  JOIN "Membership" target_member ON target_member."tenantId" = c."tenantId" AND target_member."userId" = c."targetMemberId"
  WHERE requester."isActive" = FALSE OR target_member."isActive" = FALSE
)
SELECT check_name, finding_class, anomaly_count,
  CASE
    WHEN finding_class = 'FAIL' AND anomaly_count > 0 THEN 'FAIL'
    WHEN finding_class = 'REVIEW' AND anomaly_count > 0 THEN 'REVIEW'
    ELSE 'PASS'
  END AS result
FROM checks
ORDER BY
  CASE finding_class WHEN 'FAIL' THEN 0 ELSE 1 END,
  check_name;

-- ============================================================================
-- Level 2: ID-only details
-- Review only checks whose Level 1 count is greater than zero.
-- referenced_tenant_id is NULL for true orphans or identity-history findings.
-- ============================================================================

WITH details(check_name, finding_class, record_id, record_tenant_id, referenced_id, referenced_tenant_id) AS (
  SELECT 'shift_assignment_monthly_shift_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."monthlyShiftId", p."tenantId"
  FROM "ShiftAssignment" c JOIN "MonthlyShift" p ON p.id = c."monthlyShiftId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_monthly_shift_orphan', 'FAIL', c.id, c."tenantId", c."monthlyShiftId", NULL::uuid
  FROM "ShiftAssignment" c LEFT JOIN "MonthlyShift" p ON p.id = c."monthlyShiftId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'shift_assignment_staff_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "ShiftAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_staff_orphan', 'FAIL', c.id, c."tenantId", c."staffId", NULL::uuid
  FROM "ShiftAssignment" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'shift_assignment_work_pattern_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."workPatternId", p."tenantId"
  FROM "ShiftAssignment" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_assignment_work_pattern_orphan', 'FAIL', c.id, c."tenantId", c."workPatternId", NULL::uuid
  FROM "ShiftAssignment" c LEFT JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND p.id IS NULL
  UNION ALL
  SELECT 'shift_request_staff_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "ShiftRequest" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_request_staff_orphan', 'FAIL', c.id, c."tenantId", c."staffId", NULL::uuid
  FROM "ShiftRequest" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_work_rule_staff_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "StaffWorkRule" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_work_rule_staff_orphan', 'FAIL', c.id, c."tenantId", c."staffId", NULL::uuid
  FROM "StaffWorkRule" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_work_rule_work_pattern_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."workPatternId", p."tenantId"
  FROM "StaffWorkRule" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_work_rule_work_pattern_orphan', 'FAIL', c.id, c."tenantId", c."workPatternId", NULL::uuid
  FROM "StaffWorkRule" c LEFT JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."workPatternId" IS NOT NULL AND p.id IS NULL
  UNION ALL
  SELECT 'shift_staffing_requirement_attribute_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."attributeDefinitionId", p."tenantId"
  FROM "ShiftStaffingRequirement" c JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'shift_staffing_requirement_attribute_orphan', 'FAIL', c.id, c."tenantId", c."attributeDefinitionId", NULL::uuid
  FROM "ShiftStaffingRequirement" c LEFT JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_attribute_assignment_staff_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "StaffAttributeAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_attribute_assignment_staff_orphan', 'FAIL', c.id, c."tenantId", c."staffId", NULL::uuid
  FROM "StaffAttributeAssignment" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_attribute_assignment_definition_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."attributeDefinitionId", p."tenantId"
  FROM "StaffAttributeAssignment" c JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'staff_attribute_assignment_definition_orphan', 'FAIL', c.id, c."tenantId", c."attributeDefinitionId", NULL::uuid
  FROM "StaffAttributeAssignment" c LEFT JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'staff_user_orphan', 'FAIL', c.id, c."tenantId", c."userId", NULL::uuid
  FROM "Staff" c LEFT JOIN "User" u ON u.id = c."userId"
  WHERE c."userId" IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'staff_same_tenant_membership_missing', 'FAIL', c.id, c."tenantId", c."userId", NULL::uuid
  FROM "Staff" c JOIN "User" u ON u.id = c."userId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."userId"
  WHERE c."userId" IS NOT NULL AND m."userId" IS NULL
  UNION ALL
  SELECT 'notification_member_user_orphan', 'FAIL', c.id, c."tenantId", c."memberId", NULL::uuid
  FROM "Notification" c LEFT JOIN "User" u ON u.id = c."memberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'notification_same_tenant_membership_missing', 'FAIL', c.id, c."tenantId", c."memberId", NULL::uuid
  FROM "Notification" c JOIN "User" u ON u.id = c."memberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."userId" IS NULL
  UNION ALL
  SELECT 'shift_swap_requester_user_orphan', 'FAIL', c.id, c."tenantId", c."requesterId", NULL::uuid
  FROM "ShiftSwapRequest" c LEFT JOIN "User" u ON u.id = c."requesterId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'shift_swap_requester_membership_missing', 'FAIL', c.id, c."tenantId", c."requesterId", NULL::uuid
  FROM "ShiftSwapRequest" c JOIN "User" u ON u.id = c."requesterId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."requesterId"
  WHERE m."userId" IS NULL
  UNION ALL
  SELECT 'shift_swap_target_user_orphan', 'FAIL', c.id, c."tenantId", c."targetMemberId", NULL::uuid
  FROM "ShiftSwapRequest" c LEFT JOIN "User" u ON u.id = c."targetMemberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'shift_swap_target_membership_missing', 'FAIL', c.id, c."tenantId", c."targetMemberId", NULL::uuid
  FROM "ShiftSwapRequest" c JOIN "User" u ON u.id = c."targetMemberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."targetMemberId"
  WHERE m."userId" IS NULL
  UNION ALL
  SELECT 'invitation_staff_tenant_mismatch', 'FAIL', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "Invitation" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."staffId" IS NOT NULL AND c."tenantId" <> p."tenantId"
  UNION ALL
  SELECT 'invitation_staff_orphan', 'FAIL', c.id, c."tenantId", c."staffId", NULL::uuid
  FROM "Invitation" c LEFT JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."staffId" IS NOT NULL AND p.id IS NULL
  UNION ALL
  SELECT 'invitation_creator_user_missing', 'REVIEW', c.id, c."tenantId", c."createdByUserId", NULL::uuid
  FROM "Invitation" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'invitation_creator_authorization_history', 'REVIEW', c.id, c."tenantId", c."createdByUserId", NULL::uuid
  FROM "Invitation" c JOIN "User" u ON u.id = c."createdByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."createdByUserId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE
  UNION ALL
  SELECT 'monthly_shift_creator_user_missing', 'REVIEW', c.id, c."tenantId", c."createdByUserId", NULL::uuid
  FROM "MonthlyShift" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'monthly_shift_creator_membership_history', 'REVIEW', c.id, c."tenantId", c."createdByUserId", NULL::uuid
  FROM "MonthlyShift" c JOIN "User" u ON u.id = c."createdByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."createdByUserId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE
  UNION ALL
  SELECT 'monthly_shift_confirmer_user_missing', 'REVIEW', c.id, c."tenantId", c."confirmedByUserId", NULL::uuid
  FROM "MonthlyShift" c LEFT JOIN "User" u ON u.id = c."confirmedByUserId"
  WHERE c."confirmedByUserId" IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'monthly_shift_confirmer_membership_history', 'REVIEW', c.id, c."tenantId", c."confirmedByUserId", NULL::uuid
  FROM "MonthlyShift" c JOIN "User" u ON u.id = c."confirmedByUserId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."confirmedByUserId"
  WHERE c."confirmedByUserId" IS NOT NULL
    AND m."userId" IS NULL
    AND u."isPlatformAdmin" = FALSE
  UNION ALL
  SELECT 'tenant_feature_creator_user_missing', 'REVIEW', c.id, c."tenantId", c."createdByUserId", NULL::uuid
  FROM "TenantFeature" c LEFT JOIN "User" u ON u.id = c."createdByUserId"
  WHERE c."createdByUserId" IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'audit_log_member_user_orphan', 'FAIL', c.id, c."tenantId", c."memberId", NULL::uuid
  FROM "AuditLog" c LEFT JOIN "User" u ON u.id = c."memberId"
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'audit_log_actor_membership_history', 'REVIEW', c.id, c."tenantId", c."memberId", NULL::uuid
  FROM "AuditLog" c JOIN "User" u ON u.id = c."memberId"
  LEFT JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."userId" IS NULL AND u."isPlatformAdmin" = FALSE
  UNION ALL
  SELECT 'active_staff_rule_inactive_staff', 'REVIEW', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "StaffWorkRule" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_staff_rule_inactive_work_pattern', 'REVIEW', c.id, c."tenantId", c."workPatternId", p."tenantId"
  FROM "StaffWorkRule" c JOIN "WorkPattern" p ON p.id = c."workPatternId"
  WHERE c."isActive" = TRUE AND c."workPatternId" IS NOT NULL AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_staffing_requirement_inactive_attribute', 'REVIEW', c.id, c."tenantId", c."attributeDefinitionId", p."tenantId"
  FROM "ShiftStaffingRequirement" c JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_attribute_assignment_inactive_staff', 'REVIEW', c.id, c."tenantId", c."staffId", p."tenantId"
  FROM "StaffAttributeAssignment" c JOIN "Staff" p ON p.id = c."staffId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'active_attribute_assignment_inactive_definition', 'REVIEW', c.id, c."tenantId", c."attributeDefinitionId", p."tenantId"
  FROM "StaffAttributeAssignment" c JOIN "StaffAttributeDefinition" p ON p.id = c."attributeDefinitionId"
  WHERE c."isActive" = TRUE AND p."isActive" = FALSE
  UNION ALL
  SELECT 'notification_inactive_membership_history', 'REVIEW', c.id, c."tenantId", c."memberId", m."tenantId"
  FROM "Notification" c
  JOIN "Membership" m ON m."tenantId" = c."tenantId" AND m."userId" = c."memberId"
  WHERE m."isActive" = FALSE
  UNION ALL
  SELECT 'shift_swap_inactive_membership_history', 'REVIEW', c.id, c."tenantId", c."requesterId", requester."tenantId"
  FROM "ShiftSwapRequest" c
  JOIN "Membership" requester ON requester."tenantId" = c."tenantId" AND requester."userId" = c."requesterId"
  JOIN "Membership" target_member ON target_member."tenantId" = c."tenantId" AND target_member."userId" = c."targetMemberId"
  WHERE requester."isActive" = FALSE OR target_member."isActive" = FALSE
)
SELECT check_name, finding_class, record_id, record_tenant_id,
  referenced_id, referenced_tenant_id
FROM details
ORDER BY
  CASE finding_class WHEN 'FAIL' THEN 0 ELSE 1 END,
  check_name,
  record_id;

ROLLBACK;
