# Generator future HARD capacity reservation design

## Status and scope

- Status: option B approved for bounded implementation and isolated verification on 2026-08-17.
- Baseline: `main` at `844265d08d202407c3317a03a0b91e160b0fc7c8`.
- Target: the existing chronological greedy generator in `rule-based-shift-generator.ts`.
- Out of scope: fixture changes, expectation changes, database changes, Tenant DB defense, RLS, annual fairness, and production database access.
- Production/formal database status: not connected; implementation verification must use pure unit tests, fixtures, or an isolated E2E database only.

## RC1 symptom and confirmed cause

For 2030-01-12, the expected Saturday HARD coverage is EARLY 1, LATE 1, NORMAL 1, and at least 3 workers. The observed result is EARLY 1, LATE 1, NORMAL 0, total 2, with `SATURDAY_MINIMUM_SHORTAGE`.

The generator processes dates from the first day of the month. Candidate eligibility checks only the current assignment against weekly and monthly limits. It does not estimate demand later in the same week. Normal-capable Saturday staff can therefore consume all five weekly days by Friday.

An anonymized replay of the official seed conditions confirms the capacity mechanism:

| Candidate | Weekly limit | Mon–Fri assignments | Used | Remaining Friday night | Saturday result |
| --- | ---: | --- | ---: | ---: | --- |
| C04 | 5 | N/N/N/N/N | 5 | 0 | OFF |
| C05 | 5 | N/N/N/N/N | 5 | 0 | OFF |
| C07 | 5 | N/L/N/N/N | 5 | 0 | OFF |
| C08 | 5 | N/E/N/N/N | 5 | 0 | OFF |
| C09 | 5 | OFF/E/OFF/L/N | 3 | 2 | EARLY |
| C11 | 5 | L/N/E/N/L | 5 | 0 | OFF |
| C12 | 5 | E/N/L/N/E | 5 | 0 | OFF |
| C13 | 5 | N/N/N/E/N | 5 | 0 | OFF |
| C14 | 5 | N/N/N/L/N | 5 | 0 | OFF |

The labels are anonymous and contain no names or email addresses. C09 is the only general candidate with capacity left, but EARLY is allocated before NORMAL. Once C09 covers the Saturday EARLY requirement, no general NORMAL candidate remains. The previously recorded full RC1 run retains a dedicated/eligible LATE assignment, so the final observed shortage is NORMAL only.

## Existing HARD and SOFT boundaries

HARD eligibility must remain unchanged:

- approved/pending leave and day-off requests;
- closed dates and Saturday/Sunday operation settings;
- StaffWorkRule prohibitions and FIXED assignments;
- shift-pattern eligibility;
- weekly/monthly hour and day limits;
- maximum consecutive work/special-shift limits;
- daily early, late, minimum-total and class requirements;
- active `ShiftStaffingRequirement` rows whose `constraintLevel` is `HARD`.

SOFT ordering remains subordinate to HARD feasibility:

- early/late fairness;
- transition burden;
- preferred patterns;
- monthly target guidance;
- SOFT staffing requirements;
- total-work and Saturday fairness.

## Options

### A. Saturday-only reservation

Reserve one or more Saturday-capable workers while allocating Monday–Friday.

- Advantage: small and easy to explain.
- Disadvantages: embeds Saturday-specific behavior, risks tenant-specific assumptions, does not handle holidays or other future HARD dates, and tends to reserve a fixed number too aggressively.
- Assessment: not recommended except as a temporary emergency patch.

### B. Future HARD capacity reservation

Before consuming a candidate's remaining weekly capacity, estimate whether that action reduces the maximum attainable HARD coverage on later dates in the same week.

- Advantages: fixes the underlying time-order problem, applies to Saturdays and exceptional dates, preserves the current day-by-day generator, and can use existing settings and staffing requirements.
- Disadvantages: needs a careful feasibility model for overlapping requirements and more unit tests; candidate sorting becomes more expensive.
- Assessment: recommended as a bounded weekly look-ahead.

### C. Week-at-a-time generation

Replace daily greedy allocation with a weekly solver.

- Advantages: closer to global optimization and naturally sees all weekly constraints.
- Disadvantages: broad rewrite, higher calculation and regression risk, and changes fairness/order behavior throughout the product.
- Assessment: defer until option B has operational evidence or requirements exceed bounded look-ahead.

## Recommended minimum design: B with marginal feasibility

Do not reserve named workers. Reserve only the minimum *capacity* required to keep future HARD constraints feasible.

### 1. Build the current-week horizon

For each allocation date, inspect only later open dates through Sunday or month end. This bounds calculation and aligns with weekly day limits.

### 2. Build a normalized HARD demand view

Use existing configuration rather than garden-specific constants:

- EARLY/LATE demand from `TenantShiftSetting`;
- minimum total staffing from `saturdayMinimumStaff` and the existing weekday/class calculation;
- class demand from active `ClassStaffingRequirement`;
- attribute/qualification demand from active `ShiftStaffingRequirement` with `constraintLevel=HARD`;
- FIXED work patterns as pre-allocated demand coverage.

`ShiftStaffingRequirement` currently describes an attribute, date/day and optional class, but not a required shift pattern. Treat it as “any eligible working assignment” unless the data model is explicitly extended later. Do not infer EARLY/LATE from its name or code.

Overlapping constraints must not be added as independent headcounts. One assignment may satisfy total, class, and attribute constraints simultaneously. The feasibility evaluator should keep a constraint vector per day and evaluate assignments against all applicable constraints, reusing the existing active-requirement and attribute helpers.

### 3. Build future candidate capacity

For each staff/date/type combination, apply the existing HARD checks without mutating assignments:

- request/leave and closed-day exclusion;
- Saturday eligibility and shift capability;
- StaffWorkRule availability/prohibition/FIXED;
- remaining weekly/monthly capacity;
- consecutive-work feasibility;
- work-pattern active state.

Known future FIXED assignments and leave consume or remove capacity before evaluating ordinary candidates.

### 4. Compare marginal feasibility

For a candidate under consideration today:

1. Calculate the maximum number of future HARD constraints that can be satisfied with current remaining capacities.
2. Tentatively consume one weekly day and the relevant minutes for that candidate.
3. Recalculate future maximum HARD satisfaction.
4. Define `futureHardLoss = before - after`.

Candidate ordering is lexicographic:

1. satisfy today's HARD constraint;
2. prefer `futureHardLoss = 0`;
3. prefer the smallest positive loss only when unavoidable;
4. apply existing SOFT/fairness ordering.

A small bipartite matching or bounded search is sufficient for the weekly horizon. Cache results by date, candidate and shift type. At approximately 100 staff and at most six future dates, this remains bounded; benchmark before enabling broadly.

### 5. Prevent over-reservation

- Never block a candidate needed to satisfy today's HARD demand if no alternative can satisfy it.
- Reserve only when another candidate can satisfy today's slot with less future HARD loss.
- Recalculate after every accepted assignment; do not reserve a fixed Saturday headcount.
- Stop reserving once every future HARD constraint remains feasible.
- If both today and a future day cannot be satisfied, minimize total HARD shortage and retain existing warnings. Do not violate leave, prohibition, weekly limits, or other HARD constraints.
- Reservation affects ordering only; it must not convert an ineligible candidate into an eligible one.

### 6. Warning behavior

Keep existing shortage warnings, including `EARLY_SHORTAGE`, `LATE_SHORTAGE`, `SATURDAY_MINIMUM_SHORTAGE`, class shortages, and `STAFFING_REQUIREMENT_HARD`. Look-ahead improves feasible allocation but does not claim that staffing is always sufficient.

## Minimal implementation boundary for the next task

Primary change location:

- `apps/api/src/application/shifts/rule-based-shift-generator.ts`

Likely helper extraction:

- a pure `future-hard-capacity-evaluator.ts` for normalized demand, static future eligibility, and marginal loss;
- reuse exports from `staffing-requirement-evaluator.ts` and `staff-work-rule-evaluator.ts`.

No controller, DTO, Prisma schema, migration, seed, or fixture change is required for the first implementation.

## Impact audit

| Area | Expected impact | Reason |
| --- | --- | --- |
| Weekday placement | Change possible | interchangeable staff may be reordered to preserve scarce future capacity |
| Saturday placement | Change possible | intended improvement |
| EARLY/LATE/NORMAL | Change possible | future scarcity becomes a HARD-ordering factor |
| Monthly targets | Small | remains a later SOFT tie-breaker |
| Requests / paid leave | No semantic impact | remain hard exclusions |
| StaffWorkRule | Small | eligibility unchanged; future evaluation must reuse it |
| Weekly limits | No semantic impact | limits remain hard; utilization distribution changes |
| Consecutive-work limits | Small | unchanged, but look-ahead must model them conservatively |
| Early/late fairness | Small | may yield when future HARD coverage is at risk |
| Transition/other SOFT burden | Small | may yield when future HARD coverage is at risk |
| Class placement | Change possible | future class scarcity may alter interchangeable staff |
| Warning display | Small | same codes; feasible shortages should decrease |

Overall implementation risk is **medium**: the change can reorder assignments broadly, but the algorithm and horizon can remain isolated and bounded.

## Required tests

### RC1

- 2030-01-12 has EARLY >= 1, LATE >= 1, NORMAL >= 1, total >= 3.
- The warning `SATURDAY_MINIMUM_SHORTAGE` is absent only when the requirement is actually satisfied.

### Other Saturdays and weekdays

- Every other January 2030 Saturday retains its HARD coverage.
- Preserving future capacity does not create a weekday HARD shortage.
- A non-Saturday exceptional HARD requirement also receives capacity preservation.

### HARD safety

- leave, paid leave, REQUIRED_DAY_OFF and unavailable rules are never overwritten;
- weekly/monthly and consecutive-work limits are never exceeded;
- FIXED assignments remain authoritative unless an existing higher-priority conflict blocks them;
- inactive patterns are not used.

### Insufficient capacity

- When total capacity is mathematically insufficient, no HARD limit is violated;
- the existing shortage warning reports the correct date, required and assigned counts;
- today's shortage is not created merely to hide a future shortage.

### SOFT and regression

- early/late fairness and transition-burden tests remain within their existing invariants;
- monthly target, StaffWorkRule, class placement, staffing requirement, export, B4 print and calendar regressions pass;
- add a deterministic unit test proving only the minimum future capacity is preserved;
- benchmark a 100-staff monthly generation to establish a runtime ceiling.

## Human approval gates

1. Approve option B and the bounded weekly feasibility definition.
2. Approve whether the first implementation covers attribute/class HARD constraints immediately or introduces them behind the same evaluator in two reviewed increments.
3. Review assignment diffs for RC1 and representative non-RC1 months before merging.
