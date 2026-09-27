# Deferred ADMIN formal import

Use this procedure only after implementation review, operations-image verification and a separately authorized Production import. It does not authorize deployment or writes.

The original formal package remains byte-for-byte unchanged. Identity comes from Source 001; operational conditions from Source 039 and its approved/provisional dependencies. This change does not resolve the administrator's Staff identity.

## Execution input

Create a protected Git-external execution envelope with an explicit `adminLinkMode`:

- `DEFERRED`: no `adminEmployeeNumber` property; all 23 Staff remain unlinked.
- `LINKED`: an explicitly confirmed `adminEmployeeNumber` is required. Existing linked imports remain supported.

The envelope binds the original package bytes and SHA-256, target Tenant UUID, approval reference and execution mode. Treat the envelope as PII because it contains the original package. Preserve existing directory/file protection and Production read-only roster mount protections. Never place it in Git, logs, command arguments or Notion.

Derive via `preflight-musubi-formal-package.cjs --derive --execution-envelope --input <original> --output <protected-envelope> --tenant-id <target> --parent-sha256 <approved-hash> --approval-reference <authorization-reference> --admin-link-mode DEFERRED`. Do not supply an anonymous Staff ID in DEFERRED mode. Creation is exclusive and cannot overwrite an existing output.

Preflight via the same CLI with `--execution-envelope --input <protected-envelope> --tenant-id <target> --parent-sha256 <approved-hash>`. Omit derive/output flags. It performs a read-only transaction and requires exactly one active ADMIN Membership belonging to an active User and zero Staff.

Import dry-run via `import-musubi-beta.cjs <protected-envelope> --execution-envelope --tenant-id <target> --parent-sha256 <approved-hash>`. Production environment, database, migration and input-mount safeguards remain mandatory. The dry-run receipt binds the exact input checksum and admin link mode as well as the existing database/target identifiers.

Only after all gates and authorized review, use the same input and arguments with `--apply`; then use `--verify`. Neither mode may reuse the other mode's receipt. After import, apply/verify `STAFF_DEPENDENT` under its own existing authorization and receipt gates.

## Expected results

DEFERRED: Staff23, linked Staff0, active ADMIN Membership1. User and Membership records are unchanged; mustChangePassword remains true when initially true. Audit records mode DEFERRED, administratorLinkedToExistingStaff=false, adminStaffLinkPending=true. Existing Staff links cause refusal; this command does not unlink anyone. LINKED retains exactly one login link.

Verify performs no writes. Confirm department18/2/3, generator20, foodfixed3/excluded3, no invented annual targets or leave balances, and unchanged other Tenant data. Link the administrator in a separate explicitly authorized step only after identity confirmation.

## Isolated regression

Run API lint/build and `npm run test:release-gate`. With a disposable PostgreSQL database, existing 30 migrations, role grants and explicit isolated-test environment, run `node test/deferred-formal-import.e2e.cjs` plus tenant-zero-staff, formal-import-isolated, bootstrap-deferred-link and Release Gate DB regressions. Use anonymous fixtures only.
