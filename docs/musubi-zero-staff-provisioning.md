# Musubi: Staff 0 provisioning

The phase order is Tenant creation → `TENANT_ONLY` → formal preflight → real administrator bootstrap → staff import → `STAFF_DEPENDENT`. No migration is required. Tenant creation and real administrator credentials remain separate approved operations.

`apply-musubi-tenant-master.cjs --tenant-id <uuid> --scope TENANT_ONLY` prepares a scope-specific dry-run receipt. Add `--apply` only after the existing production confirmation gates. This scope writes patterns, departments, attribute definitions, requirements, common settings and source-aware features, with no Staff/User/Membership/individual assignment writes. The provisional SOFT configuration is installed by `STAFF_DEPENDENT`. A later tenant-only replay preserves it.

`--scope STAFF_DEPENDENT` requires 23 staff and existing common definitions. It restores the Master attribute/feature metadata after importer initialization, and applies individual profiles, department/attribute assignments, fixed times and rules. Default `ALL` executes both scopes in one transaction; failure of the staff check rolls back common writes. Existing source/P09 revision guards apply to every scope. Receipts cannot be reused across scopes.

## Preflight input and execution

`preflight-musubi-formal-package.cjs --derive --input <protected-parent> --output <new-protected-file> --tenant-id <generated-target-uuid> --parent-sha256 <approved-parent-hash> --approval-reference <preflight-only-reference>` creates an exclusive 600 file in an existing Git-external 700 owner directory. Local creation uses the existing isolated local file guard (local test environment, no DB connection for derivation). Production reading retains the existing Linux UID/GID 20001, root:20001 640 read-only roster mount guard. Do not weaken either guard.

The dedicated envelope retains the exact parent bytes as Base64 (encoding, **not encryption**), parent hash, target UUID, PRODUCTION environment, creation timestamp, approval reference and purpose `PRODUCTION_PREFLIGHT`. It is PII and must never enter Git, logs or Notion. It is not an apply package. No parent staff, conditions, source fields, or production approval flag are rewritten. Derivation validates identity source 001, unique names, Matrix 039 values, 23 / 18+2+3 / 20+3, provisional values and absence of fabricated annual contracts.

`preflight-musubi-formal-package.cjs --input <protected-derived-file> --tenant-id <target-uuid> --parent-sha256 <approved-parent-hash>` checks environment/database/migrations, requires the existing matching Tenant code and Staff 0, and performs database reads inside `SET TRANSACTION READ ONLY`. It does not require an administrator, create a dry-run apply receipt, or authorize import. `--apply` is rejected. Output contains counts, hashes and target UUID only; failures do not print package content.

The original importer and its ADMIN requirement are unchanged. It rejects the preflight envelope. Import/apply later requires its own bound input, human approval, real administrator and existing operation/file guards.

## Verification

Use only disposable local PostgreSQL with the existing 30 migrations and role-separated grants. `npm run test:tenant-zero-staff` covers Staff/User/Membership 0, common setup twice, preflight twice with production checks in isolated rehearsal, database-enforced read-only behavior, ADMIN-zero apply refusal, wrapper apply refusal, protected derivation, bootstrap with anonymous credentials and deferred staff linkage, 23-staff import, staff-dependent Master, bulk parity, rollback and other-Tenant preservation.

Also run API lint/build, Release Gate, formal import isolated E2E, generator regressions, tenant DB constraints and DB role isolation. No Production connection, commit or push is part of this implementation task.

## Administrator before staff identity confirmation

`INITIAL_ADMIN_STAFF_MODE=deferred-link` allows `INITIAL_ADMIN_EMPLOYEE_NUMBER` to be omitted or blank when the administrator identity mapping is not yet confirmed. It creates only the User, ADMIN Membership and existing creation audit record. No Staff or guessed employee number is created. The audit retains `staffMode: deferred-link` and includes `pendingEmployeeNumber` only when explicitly supplied. Confirm the administrator-to-Staff mapping after the approved roster import before linking. Existing production confirmations, dry-run receipt, credential validation, duplicate protection, transaction rollback and mandatory initial password change remain unchanged.

Run `node test/bootstrap-deferred-link.e2e.cjs` with a disposable isolated database and local API; it covers unspecified/blank/explicit deferred IDs, safe rejection, authentication and tenant boundaries.
