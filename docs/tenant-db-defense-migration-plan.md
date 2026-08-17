# Tenant DB Defense Migration Plan

## 1. Status and scope

- Baseline commit: `4fd38f7d608592ba963d513f3038491b925414d9`
- Source of truth: `apps/api/prisma/schema.prisma` (Prisma `6.16.1`, PostgreSQL)
- Approved direction: API tenant checks plus database composite constraints (Plan B)
- This document is design only. It does not authorize schema changes, migration creation or execution, database access, or production auditing.
- The isolated-database audit at the baseline commit passed all 44 checks. That result verifies the audit against synthetic isolated data only; production data remains unaudited.

## 2. Design principles

For a tenant-owned parent, add a candidate key such as `@@unique([tenantId, id])`, then make the child relation reference both columns:

```prisma
// Concept only; not an implementation patch.
@@unique([tenantId, id])

staff Staff @relation(fields: [tenantId, staffId], references: [tenantId, id])
```

PostgreSQL and Prisma 6.16.1 support composite unique keys and composite foreign keys. The child already carries `tenantId`, so Phase 1 requires no new data column. PostgreSQL requires the referenced column tuple to be unique; therefore each parent needs `UNIQUE (tenantId, id)`, even though `id` alone is already the primary key. The composite unique index also supports tenant-scoped joins. Before implementation, validate the proposed Prisma schema with `prisma validate` in an isolated branch because the same child `tenantId` participates in its Tenant relation and several composite relations.

Keep existing scalar ID fields (`staffId`, `monthlyShiftId`, `workPatternId`) and public DTOs. Replace the relation's foreign-key definition rather than introducing new identifiers. Do not keep both old and new foreign keys permanently: they duplicate enforcement and can produce conflicting delete actions. A short database-only coexistence window is acceptable while the application schema still uses the old relation.

## 3. Phase plan

### Phase 1 — scheduling core (highest risk)

| Child relation | Current FK | Parent key to add | Composite FK | Existing useful index / proposed index |
|---|---|---|---|---|
| `ShiftAssignment.monthlyShift` | `monthlyShiftId -> MonthlyShift.id` | `MonthlyShift(tenantId, id)` | `(tenantId, monthlyShiftId) -> MonthlyShift(tenantId, id)` | Existing `@@index([monthlyShiftId, workDate])`; add `(tenantId, monthlyShiftId)` only if query-plan review shows need |
| `ShiftAssignment.staff` | `staffId -> Staff.id` | `Staff(tenantId, id)` | `(tenantId, staffId) -> Staff(tenantId, id)` | Existing `@@index([tenantId, staffId, workDate])` covers FK prefix |
| `ShiftAssignment.workPattern` | nullable `workPatternId -> WorkPattern.id` | `WorkPattern(tenantId, id)` | `(tenantId, workPatternId) -> WorkPattern(tenantId, id)` | Existing `@@index([tenantId, workPatternId])` covers FK |
| `ShiftRequest.staff` | `staffId -> Staff.id` | reuse `Staff(tenantId, id)` | `(tenantId, staffId) -> Staff(tenantId, id)` | Existing `@@index([tenantId, staffId, requestDate])` covers FK |
| `StaffWorkRule.staff` | `staffId -> Staff.id` | reuse `Staff(tenantId, id)` | `(tenantId, staffId) -> Staff(tenantId, id)` | Existing `@@index([tenantId, staffId, isActive])` covers FK |
| `StaffWorkRule.workPattern` | nullable `workPatternId -> WorkPattern.id` | reuse `WorkPattern(tenantId, id)` | `(tenantId, workPatternId) -> WorkPattern(tenantId, id)` | Add `@@index([tenantId, workPatternId])` |

Preserve current delete behavior: MonthlyShift cascade, Staff restriction/cascade as currently declared by each relation, and nullable WorkPattern `SetNull`/`Restrict`. A composite `SET NULL` relation needs special validation because `tenantId` is shared and non-null: PostgreSQL's default action would attempt to null every referencing column. For `ShiftAssignment.workPattern`, prefer migration SQL that sets only `workPatternId` to null if the PostgreSQL version and Prisma migration representation permit it; otherwise change the behavior deliberately (for example `Restrict`) rather than weakening `tenantId`. This is a human approval point.

Prisma schema changes replace each `fields: [id] / references: [id]` pair with the composite tuple. Scalar DTOs can remain unchanged, but generated Prisma relation inputs and compound-unique selectors may change. Existing `include` and `select` result shapes should remain stable; generated input types and relation `connect` syntax require compile-time verification.

Affected application paths:

- `ShiftsService`: monthly-shift creation and lookup, assignment `upsert`, generated assignment `createMany`, schedule confirmation/draft, calendar and generation reads.
- `RequestsService`: request create/update/cancel and `staff` include.
- `StaffWorkRulesService`: create/reactivate/update, pattern validation, and `workPattern` include.
- Shift generation evaluators consume assignment, staff, work-pattern, request, attribute and rule includes and require regression coverage.
- Direct Prisma writers in `prisma/seed.cjs`, setup scripts, fixtures and E2E tests need type/runtime review even when their scalar payload remains valid.

### Phase 2 — qualifications, staffing, notifications, swaps

| Child relation | Planned defense | Notes |
|---|---|---|
| `StaffAttributeAssignment.staff` | `(tenantId, staffId) -> Staff(tenantId, id)` | Reuse parent key; current index covers prefix |
| `StaffAttributeAssignment.attributeDefinition` | `(tenantId, attributeDefinitionId) -> StaffAttributeDefinition(tenantId, id)` | Add parent composite unique; current child index covers prefix |
| `ShiftStaffingRequirement.attributeDefinition` | same composite parent reference | Current child index covers prefix |
| `Notification.member` | `(tenantId, memberId) -> Membership(tenantId, userId)` | User is global; Membership is the tenant-scoped recipient. Relation/result shape changes from `User` to `Membership`, so API adaptation is required |
| `ShiftSwapRequest.requester` | `(tenantId, requesterId) -> Membership(tenantId, userId)` | Membership, not User, proves requester belongs to the tenant |
| `ShiftSwapRequest.targetMember` | `(tenantId, targetMemberId) -> Membership(tenantId, userId)` | Same; two named Membership relations are required |

`Membership` already has primary key `(tenantId, userId)`, so no additional parent unique is needed. Phase 2 has higher application compatibility cost than Phase 1 because Notification and ShiftSwap currently expose User relations. Review `StaffAttributesService`, `StaffingRequirementsService`, `NotificationsService`, `ShiftSwapsService`, their controllers, audit calls, generator evaluators, seed/setup code and related E2E tests.

### Phase 3 — actors, creators and historical records

- `Staff.user`: when non-null, reference `Membership(tenantId, userId)` so a staff record can only link to a user belonging to that tenant. Multiple Membership rows for one User remain valid. Platform Admin authority is not modeled as a tenant-owned business relation and must not bypass this invariant.
- `MonthlyShift.createdByUserId` and nullable `confirmedByUserId`: add explicit tenant-scoped creator/confirmer relations to Membership after deciding retention behavior.
- `Invitation.createdByUserId` and optional `staffId`: bind creator to Membership and staff to `(tenantId, id)`.
- `TenantFeature.createdByUserId`: bind non-null actors to Membership; define how platform-originated changes are represented before making it mandatory.
- `AuditLog.memberId`: do not blindly cascade historical logs with Membership/User deletion. First decide whether the actor FK is nullable/`SET NULL`, restrictive, or intentionally absent with immutable actor ID/snapshot. Tenant mismatch must be prevented without destroying evidence.
- `TenantSubscription`, `TenantShiftSetting`, `ClassStaffingRequirement`, and `TenantClosedDate` reference only their own Tenant and need no cross-tenant composite relation today.

Phase 3 requires business decisions about Platform Admin actions, deleted users, invitation lifecycle and audit retention. It is intentionally last.

## 4. Safe migration sequence per phase

1. Pin application/schema commit and obtain human approval.
2. Run the committed 44-check read-only audit against an approved environment; require zero tenant mismatch and zero critical orphan.
3. Add parent composite unique constraints/indexes only.
4. Add child composite foreign keys while old single-column foreign keys remain temporarily.
5. Validate Prisma schema/client compatibility and apply only to an isolated database.
6. Run direct database cross-tenant rejection tests, API tenant-boundary tests and the full regression suite.
7. Review query plans and lock duration; obtain human approval.
8. Deploy compatible API/schema changes and constraints in an ordered release window.
9. Remove redundant old foreign keys only after the composite constraints are validated and all writers are compatible.
10. Run the read-only post-migration audit, then proceed to the next phase.

This staged addition is safer than one-shot replacement: it keeps existing valid writes working, separates index/constraint failures from API type failures, and gives a rollback point before old protection is removed. Exact ordering between Prisma schema deployment and manually staged SQL must be rehearsed because Prisma's generated migration normally represents the final state, not a long-lived dual-FK state.

## 5. `NOT VALID` decision

Recommendation: **conditional**, primarily for production tables large enough that immediate validation creates an unacceptable lock or scan window.

PostgreSQL can add a foreign key `NOT VALID`: new/changed rows are enforced immediately while existing rows are checked later by `VALIDATE CONSTRAINT`. This is useful for production rollout and rollback control. It does not apply to the required parent unique constraint in the same way, and Prisma schema/migration generation does not express the operational validation state cleanly; custom SQL and an operations checklist are required.

For the current AeN Shift size, default to an ordinary composite FK in isolated and staging databases. Before production, measure row counts and lock behavior. Use `NOT VALID` only when those measurements justify the extra operational state, and require a named follow-up migration/step that validates every constraint before the old FK is removed.

## 6. API and Prisma impact

Overall impact: **medium** for Phase 1. Existing DTO fields remain scalar IDs and most `create`, `createMany`, `upsert`, `update`, `include` and `select` calls can retain their payload/result shape. Risk concentrates in generated Prisma input types, compound `connect`/`connectOrCreate`, nested writes, nullable composite relations and delete actions.

Phase 1 code review matrix:

| Model | Services/controllers | Write/read operations to verify |
|---|---|---|
| `ShiftAssignment` / `MonthlyShift` | `ShiftsService`, `ShiftsController`; generation evaluators | `create`, assignment `upsert`, `createMany`, schedule `update`, assignment includes and calendar/generation queries |
| `ShiftRequest` | `RequestsService`, `RequestsController`; `ShiftsService` generation/calendar reads | `create`, `update`, status transitions, `staff` include |
| `StaffWorkRule` / `WorkPattern` | `StaffWorkRulesService`, `StaffWorkRulesController`; generation evaluator | `create`, inactive-row reactivation `update`, normal `update`, pattern lookup, `workPattern` include |

No current production service was found using relation `connect`, `connectOrCreate`, or nested relation writes for these Phase 1 records; direct scalar IDs dominate. Nevertheless, generated Prisma types, seed/setup utilities and all direct test writers must be compiled/tested because schema relation metadata changes.

## 7. Phase 1 test plan

### API tests

- Same-tenant assignment with MonthlyShift, Staff and optional WorkPattern succeeds.
- Tenant A cannot save Tenant B Staff, WorkPattern or MonthlyShift through assignment endpoints.
- Tenant A cannot create a ShiftRequest for Tenant B Staff.
- Tenant A cannot create/update StaffWorkRule with Tenant B Staff or WorkPattern.
- Existing API checks continue returning the intended 400/403/404 response without leaking the foreign record.
- Normal create/update/upsert/generation, nullable WorkPattern, schedule confirmation and request/rule lifecycle remain successful.

### Direct database tests

- Insert each valid same-tenant Phase 1 relation and confirm success.
- Attempt all six cross-tenant relations and assert PostgreSQL foreign-key violation.
- Assert required IDs reject null and missing parents as appropriate.
- Assert nullable `workPatternId = NULL` remains valid.
- Verify delete actions for MonthlyShift, Staff and WorkPattern exactly match the approved behavior.
- Confirm old valid rows pass constraint validation and the 44-check audit remains PASS.

### Regression tests

- Run API type-check/build and the existing shift, request, work-pattern, staff-work-rule, generator, calendar, export and full regression suites.
- Exercise seed and approved fixtures only in an isolated database.
- Compare critical query plans and write latency before/after indexes.

## 8. Rollback and compatibility

- Parent composite unique only: rollback by dropping the new unique constraint/index; no data rewrite.
- New composite FK while old FK remains: rollback by dropping only the new FK; application remains protected by the old FK plus API tenant checks.
- Prisma relation metadata/API deployment: rollback is conditional on retaining scalar columns and old FKs until the compatibility window closes.
- After removing old FKs: still reversible by restoring the old FKs, but only after an integrity check; do not combine this cleanup with first introduction.
- No phase should transform business data. Any discovered mismatch or orphan stops rollout; data repair requires a separate reviewed plan.
- Nullable WorkPattern delete semantics and Phase 2/3 Membership/audit-retention decisions must be resolved before their constraints are deployed.

Overall rollback assessment: **possible during staged coexistence; conditional after old-FK cleanup**.

## 9. Future production boundary

Production work requires a separate human-approved task. Minimum gate:

1. Confirm a current, restorable backup.
2. Human authorizes the read-only production integrity audit.
3. Require audit PASS.
4. Apply and rehearse migration in staging.
5. Run direct boundary, API and regression tests.
6. Obtain human approval of migration SQL, locks, rollback and operator.
7. Decide whether a maintenance window is required from measured table size/lock time.
8. Apply production migration with explicit environment guards.
9. Run post-migration read-only audit and monitoring.
10. Make a documented continue/rollback decision.

AI must not independently connect to or audit production. RLS remains out of scope until Plan B, tenant-boundary tests, monitoring, Platform Admin operations and Prisma connection behavior are stable at larger scale.

## 10. Human approval points and next design tasks

- Approve Phase 1 relation list and nullable WorkPattern delete behavior.
- Approve whether production rollout needs custom `NOT VALID` / `VALIDATE CONSTRAINT` SQL after staging measurements.
- Approve the Phase 2 Membership relation shape and Phase 3 actor-retention policy before implementation planning.

