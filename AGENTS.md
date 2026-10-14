# AeN Shift task scope

At the start of every task, declare PRODUCT, MUSUBI, or SHARED and identify the
workspace, target environment, excluded data, and verification plan. Read
`docs/work-scope-policy.md` before edits. This applies to all code, tests, docs,
Notion logs, demos, releases, and maintenance work in this repository.

- PRODUCT: common SaaS; anonymous fixtures only. Never treat a customer's staff,
  attendance, staffing levels or individual rules as the general specification.
- MUSUBI: Pilot maintenance and customer extensions; do not unnecessarily change
  the common BASE. Keep real data in the existing protected customer storage.
- SHARED: assess both Product and Pilot impacts before implementation; record a
  short decision and references, not duplicated detailed logs.

Production is not a development/test target. Use a separate worktree and an
explicitly isolated local test DB. Never deploy, migrate or edit Production as a
side effect of Product work. Production publication needs explicit authorization.
No paid service, paid runner or additional spend without advance approval.

Use the three Notion destinations in the policy. Do not move, delete or reclassify
historical records. Do not put real names, emails, passwords or customer-specific
work conditions into Product/Shared logs or public Git history. Logical page or
branch separation does not enforce access control; check before handling PII.
