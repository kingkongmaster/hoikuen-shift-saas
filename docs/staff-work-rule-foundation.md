# StaffWorkRule foundation

Sprint 3 adds tenant-scoped, staff-specific work-rule storage, validation, CRUD, audit and backup support. Existing `Staff` work-condition fields remain the source of truth for shift generation. The rule-based generator does not read `StaffWorkRule` in this sprint; a later sprint must explicitly define migration precedence before connecting the new model to generation.

Rules use generic types rather than tenant-specific job titles or people. References to Staff and WorkPattern are tenant checked. WorkPattern/date/time/numeric fields are accepted only for rule types that define them. Exact duplicates and straightforward contradictions are rejected. DELETE is a soft deactivation.

Only active rules participate in duplicate and conflict checks. POST of an exact inactive rule reactivates the existing record instead of creating another row and records `STAFF_WORK_RULE_REACTIVATED`. PUT may also reactivate an inactive rule after rechecking active conflicts. Period overlap is inclusive (`startA <= endB && startB <= endA`); an undated rule is always applicable, and different non-null weekdays do not conflict. The foundation detects opposing availability rules and different fixed patterns across overlapping periods. It intentionally does not solve every partial time-range interaction.

Numeric limits are 0–7 weekly days, 0–31 monthly or consecutive days, and 0–44,640 monthly minutes. Priority is 0–1,000. `booleanValue` is reserved for future extension and rejected for every current rule type. `isHardConstraint` is currently an administrative classification only: fixed/unavailable/required-off rules normally represent “must obey”, while preferred patterns normally represent a soft preference. It has no scheduling effect yet.

Inactive Staff rules remain readable for audit, but inactive Staff cannot receive new rules or updates/reactivation. Existing rules may still be deactivated. An inactive WorkPattern remains included in rule responses and is shown as inactive; an update may retain the same inactive reference, but cannot newly select a different inactive WorkPattern.

`STAFF_WORK_RULES` OFF permits ADMIN/DIRECTOR read-only access and rejects writes at the API. ON permits ADMIN writes. Web controls fail closed when entitlement loading fails and are never shown to general staff.

Backup version 2 exports `staffWorkRules`; earlier version 2 payloads without the array and version 1 remain readable. Cross-tenant and missing references are rejected during validation.

Inactive rules are exported. Backup validation applies field and numeric limits to all rows, but duplicate/conflict checks only to active rows. The `reason` field is limited to 500 characters, rejects control characters, is escaped by React, and is intentionally retained in full in AuditLog for operational traceability; operators must not enter credentials or unnecessary sensitive information.

Sprint 3時点ではStaffWorkRuleはGeneratorへ影響しない。協力園データを登録しても、自動生成へ反映されるのは将来の接続Sprint以降である。
