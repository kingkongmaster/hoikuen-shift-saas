# Staff attribute foundation

Sprint 4 adds tenant-defined ROLE, QUALIFICATION, ASSIGNMENT and SKILL definitions plus effective-dated staff assignments. Names such as 主任, 保育士 and 子育て支援 are tenant data, not enums. `ROLE_QUALIFICATION_MANAGEMENT` controls writes; ADMIN and DIRECTOR may read, ADMIN may write, and STAFF has no access.

`isPrimary` means the primary ROLE or ASSIGNMENT for an effective period. QUALIFICATION and SKILL must use `false`. Overlapping active primaries in the same staff/category are rejected with 409; the service never silently demotes or splits an existing historical assignment. Administrators must explicitly adjust the old period before registering its successor. Missing dates mean always effective; otherwise both dates are required and overlap is inclusive: `startA <= endB && startB <= endA`.

Definitions and assignments use logical deactivation. An exact inactive assignment is revalidated and reactivated instead of duplicated. Audit logs retain bounded description/notes snapshots; control characters are rejected.

Codes are 1–50 ASCII uppercase letters, digits and underscores, must start with a letter, and are rejected rather than normalized when lowercase or padded with spaces. Tenant administrators cannot set `isSystem`. Trusted system definitions cannot have code/category changed or be deactivated; only their display fields may be edited. Any definition with active or inactive assignment history cannot change category.

Sprint 4 preserves all existing Staff fields, including employmentType, jobTitle, assignedClass, special-shift flags and individual working-hour fields. The Generator and ShiftsService continue to use those existing fields only. StaffAttribute is not loaded by shift generation, so registering tenant data cannot affect assignments. A future sprint must define precedence and migration before Generator integration.
