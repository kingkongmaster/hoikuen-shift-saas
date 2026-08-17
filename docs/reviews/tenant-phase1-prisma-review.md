# Tenant Phase 1 Prisma Change Review

> **REVIEW DRAFT — DO NOT APPLY.** This file shows a proposed change only. Do not copy it into `schema.prisma`, generate a migration, connect to a database, or execute SQL without a separately approved implementation task.

## 1. Review baseline

- Repository commit reviewed: `27bb1c8` (`main`)
- Source of truth: `apps/api/prisma/schema.prisma`
- Prisma: `6.16.1`; database provider: PostgreSQL
- Scope: six Phase 1 relations only
- Existing scalar fields (`tenantId`, `monthlyShiftId`, `staffId`, `workPatternId`) remain unchanged.
- Relation names can remain the current implicit names because no Phase 1 model pair has multiple relations. Explicit `map` values below make database constraint names deterministic.

## 2. Current relations

| Relation | Nullable | Current `fields` → `references` | Current delete/update action |
|---|---:|---|---|
| `ShiftAssignment.monthlyShift` | no | `[monthlyShiftId]` → `[id]` | `CASCADE / CASCADE` |
| `ShiftAssignment.staff` | no | `[staffId]` → `[id]` | `RESTRICT / CASCADE` |
| `ShiftAssignment.workPattern` | yes | `[workPatternId]` → `[id]` | `SET NULL / CASCADE` |
| `ShiftRequest.staff` | no | `[staffId]` → `[id]` | `CASCADE / CASCADE` |
| `StaffWorkRule.staff` | no | `[staffId]` → `[id]` | `CASCADE / CASCADE` |
| `StaffWorkRule.workPattern` | yes | `[workPatternId]` → `[id]` | `RESTRICT / CASCADE` |

`onUpdate: Cascade` is currently implicit in Prisma schema and explicit in the applied migration SQL. The proposal writes it explicitly for review clarity.

## 3. Parent-side proposal

Add one composite candidate key to each tenant-owned parent. The existing primary key on `id` does not satisfy PostgreSQL's requirement for a referenced `(tenantId, id)` tuple.

```prisma
model MonthlyShift {
  // existing fields and indexes remain
  @@unique([tenantId, id], map: "MonthlyShift_tenantId_id_key")
}

model Staff {
  // existing fields and indexes remain
  @@unique([tenantId, id], map: "Staff_tenantId_id_key")
}

model WorkPattern {
  // existing fields and indexes remain
  @@unique([tenantId, id], map: "WorkPattern_tenantId_id_key")
}
```

These indexes are logically redundant for global uniqueness because `id` is already a primary key, but they are required as composite foreign-key targets. Do not add separate duplicate non-unique parent indexes on the same tuples.

## 4. Child-side proposal: before → after

### 4.1 `ShiftAssignment.monthlyShift`

```prisma
// Before
monthlyShift MonthlyShift @relation(fields: [monthlyShiftId], references: [id], onDelete: Cascade)

// After proposal
monthlyShift MonthlyShift @relation(
  fields: [tenantId, monthlyShiftId],
  references: [tenantId, id],
  onDelete: Cascade,
  onUpdate: Cascade,
  map: "ShiftAssignment_tenantId_monthlyShiftId_tenant_guard_fkey"
)
```

Existing index `@@index([monthlyShiftId, workDate])` does not begin with the complete composite FK tuple. Add:

```prisma
@@index([tenantId, monthlyShiftId], map: "ShiftAssignment_tenantId_monthlyShiftId_idx")
```

### 4.2 `ShiftAssignment.staff`

```prisma
// Before
staff Staff @relation(fields: [staffId], references: [id], onDelete: Restrict)

// After proposal
staff Staff @relation(
  fields: [tenantId, staffId],
  references: [tenantId, id],
  onDelete: Restrict,
  onUpdate: Cascade,
  map: "ShiftAssignment_tenantId_staffId_tenant_guard_fkey"
)
```

Existing `@@index([tenantId, staffId, workDate])` covers the composite FK prefix; no new child index is needed.

### 4.3 `ShiftAssignment.workPattern`

```prisma
// Before
workPattern WorkPattern? @relation(fields: [workPatternId], references: [id], onDelete: SetNull)

// After proposal — recommended history-preserving policy, pending human approval
workPattern WorkPattern? @relation(
  fields: [tenantId, workPatternId],
  references: [tenantId, id],
  onDelete: Restrict,
  onUpdate: Cascade,
  map: "ShiftAssignment_tenantId_workPatternId_tenant_guard_fkey"
)
```

`workPatternId` remains nullable. PostgreSQL's default `MATCH SIMPLE` semantics skip the composite FK check when `workPatternId IS NULL`, so a normal assignment without a WorkPattern remains valid. Existing `@@index([tenantId, workPatternId])` covers the FK.

The delete action needs explicit approval. The current public DELETE endpoint performs a logical deactivation (`isActive = false`) and never physically deletes a WorkPattern. Existing database action `SET NULL` would erase the link from historical assignments on a direct physical delete. A composite `SET NULL` would normally try to null both `tenantId` and `workPatternId`, which is incompatible with required `tenantId`; PostgreSQL-specific column-list SQL can null only `workPatternId`, but Prisma 6.16.1 cannot express that distinction in `@relation`. `Restrict` therefore gives the clearest schema/database agreement and best protects confirmed-shift history. It changes only unsupported/direct physical-delete behavior, not the current API deactivation behavior.

### 4.4 `ShiftRequest.staff`

```prisma
// Before
staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

// After proposal
staff Staff @relation(
  fields: [tenantId, staffId],
  references: [tenantId, id],
  onDelete: Cascade,
  onUpdate: Cascade,
  map: "ShiftRequest_tenantId_staffId_tenant_guard_fkey"
)
```

Existing `@@index([tenantId, staffId, requestDate])` covers the FK prefix.

### 4.5 `StaffWorkRule.staff`

```prisma
// Before
staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

// After proposal
staff Staff @relation(
  fields: [tenantId, staffId],
  references: [tenantId, id],
  onDelete: Cascade,
  onUpdate: Cascade,
  map: "StaffWorkRule_tenantId_staffId_tenant_guard_fkey"
)
```

Existing `@@index([tenantId, staffId, isActive])` covers the FK prefix.

### 4.6 `StaffWorkRule.workPattern`

```prisma
// Before
workPattern WorkPattern? @relation(fields: [workPatternId], references: [id], onDelete: Restrict)

// After proposal
workPattern WorkPattern? @relation(
  fields: [tenantId, workPatternId],
  references: [tenantId, id],
  onDelete: Restrict,
  onUpdate: Cascade,
  map: "StaffWorkRule_tenantId_workPatternId_tenant_guard_fkey"
)
```

`workPatternId = NULL` remains valid under `MATCH SIMPLE`. Add:

```prisma
@@index([tenantId, workPatternId], map: "StaffWorkRule_tenantId_workPatternId_idx")
```

## 5. Old/new FK coexistence

PostgreSQL permits the current single-column FK and new composite FK to coexist on the same ID column. Every write is checked twice during the compatibility window; this adds index lookups and constraint work but should be small at the current scale. Measure bulk assignment generation in staging.

Prisma schema can describe only one relation mapping for each relation field. Therefore:

1. Database stage A adds parent keys and composite FKs while deployed Prisma schema still describes the old FK.
2. Audit, direct DB tests and API regression run with both DB constraints.
3. In one coordinated release, switch Prisma relation metadata to the composite definition and remove the old FK only after compatibility is confirmed.

Do not ask Prisma to model old and new constraints as two relation fields; that would invent duplicate semantic relations. New constraint names use `_tenant_guard_fkey`, avoiding all current Prisma-generated names. Rollback during coexistence is `DROP CONSTRAINT` for the new composite FK plus removal of newly added parent keys/indexes after dependent constraints are gone.

Before implementation, apply the exact proposed schema to a temporary copy and run `prisma format`, `prisma validate`, client generation and TypeScript compilation. This is especially important because the same `tenantId` scalar participates in the direct `Tenant` relation and several composite relations.

## 6. WorkPattern deletion review

- API endpoint: `DELETE /work-patterns/:id` exists.
- Actual action: logical deactivation through `UPDATE`, setting `isActive = false` and `isDefault = false`.
- System patterns cannot be removed; default patterns must be replaced first.
- Existing ShiftAssignment/StaffWorkRule links remain, including links to inactive patterns.
- New rules cannot select an inactive pattern; an existing rule may retain its inactive pattern.
- Current DB actions: assignment → WorkPattern is `SET NULL`; staff rule → WorkPattern is `RESTRICT`.
- Confirmed/historical shifts are safe under the supported API path because no physical delete occurs.
- Audit action `WORK_PATTERN_DEACTIVATED` records the event and WorkPattern ID; there is no physical-delete audit action.
- Recommendation: keep logical deactivation, prohibit physical deletion of referenced patterns, and approve `Restrict` for both Phase 1 composite WorkPattern FKs. A separate product decision is required if physical deletion is ever introduced.

## 7. API impact classification

### Change required during implementation

- No public DTO/controller contract is known to require a field change.
- Prisma schema relation declarations and custom migration SQL must change in the implementation task.
- Error mapping may need a targeted change if new DB `P2003` foreign-key errors can reach public endpoints instead of existing tenant-aware 400/404 handling; decide after isolated tests.

### Type/runtime verification only

- `ShiftsService`: MonthlyShift create/update, ShiftAssignment upsert/createMany/deleteMany, assignment includes, generation/calendar reads.
- `RequestsService`: ShiftRequest create/update/cancel and Staff include.
- `StaffWorkRulesService`: create/reactivate/update/deactivate, WorkPattern validation/include.
- Shift generator, staff-work-rule evaluator and staffing-requirement evaluator.
- `ShiftSwapsService` assignment updates (it does not change relation IDs, but uses Phase 1 records).
- `MeService`, `ExportsService` and B4 print data reads.
- `prisma/seed.cjs`, provisional setup script, test fixtures and direct Prisma E2E writers.

Scalar-ID writes already include `tenantId` for the six child relations, so most code should compile unchanged. `include`/`select` result shapes should remain unchanged.

### No direct Phase 1 relation impact

- Authentication, subscription, health/readiness, PWA and notification read-state controllers do not create or reconnect the six Phase 1 relations.
- RLS and annual fairness remain out of scope.

## 8. Approved-next-step test specification

### Direct database tests

1. Same-tenant ShiftAssignment → Staff succeeds.
2. Cross-tenant ShiftAssignment → Staff fails.
3. Cross-tenant ShiftAssignment → MonthlyShift fails.
4. Cross-tenant ShiftAssignment → WorkPattern fails.
5. `ShiftAssignment.workPatternId = NULL` succeeds.
6. Cross-tenant ShiftRequest → Staff fails.
7. Cross-tenant StaffWorkRule → Staff fails.
8. Cross-tenant StaffWorkRule → WorkPattern fails.
9. `StaffWorkRule.workPatternId = NULL` succeeds for rule types that allow it.
10. WorkPattern logical deactivation preserves all historical links; physical delete of a referenced pattern is rejected under the recommended policy.

### API tests

- Existing tenant-boundary requests remain rejected without existence leakage.
- Normal shift creation/save/generation succeeds.
- Normal ShiftRequest registration and lifecycle succeeds.
- Normal StaffWorkRule registration/reactivation succeeds.
- Inactive WorkPattern rules retain their existing reference but cannot be newly selected.

### Regression tests

- Automatic shift generation and rule evaluators
- Monthly and personal calendars
- B4 print data and browser print layout
- Shift/request CSV export
- Early/late fairness allocation
- Shift-transition workload SOFT constraints
- Existing Phase 1 E2E and full API regression suite

No test is implemented by this review.

