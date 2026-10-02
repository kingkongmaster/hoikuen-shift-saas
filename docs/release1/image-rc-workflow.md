# Manual image RC and cost gate

Additional expense of any amount requires prior human approval. Unknown cost is
HOLD. Check billing before workflow creation and again before dispatch. Do not
change billing limits or buy resources to unblock a run.

The authorized scope uses the existing public repository, GitHub Free, standard
ubuntu-24.04, one job capped at 45 minutes, no shared cache or registry push.
Verify current free storage headroom of at least 400 MiB and the existing Actions
$0 budget with stop-usage enabled. Archive + report upload is capped at 400 MiB
with one-day retention. A failed security gate uploads only sanitized evidence.
No paid runners, extra registry, production credentials, SSH, Production database connection
or automatic deployment are part of this workflow.

Dispatch requires a reviewed 40-character source SHA and explicit cost/source
privacy confirmations. Control scripts come from the workflow commit; API/Web
come from the exact source SHA. Both identities remain visible in the run.
Do not build a moving branch. Human source privacy review is required because
automated contact/file patterns cannot prove absence of all personal names.

Trivy is checksum pinned and fetches a fresh database per run. Critical/High and
UNKNOWN findings block by default. The reviewed policy below can classify only
exact findings after its source and runtime guards pass. No previous risk exception
is automatically reused. Every image layer is checked for source maps; application
files are checked for forbidden private artifacts and personal-contact candidates.
Trivy secret findings and raw build logs never enter artifacts or stdout.

Image IDs are configuration digests, not registry manifest digests. Record empty
repoDigests honestly when no registry push occurred. Archive SHA-256, size,
image ID, layer digests and metadata permit later transfer checks. Runtime health
and full release acceptance remain separate gates; this workflow alone does not
claim OCTOBER_PRODUCTION_RC_VERIFIED.

GitHub requires a workflow_dispatch workflow to exist on the default branch
before its first dispatch. The formal development branch remains authoritative.
Registration on main must not merge the product branch, rewrite history or change
the repository default branch without authorization.

## Reviewed reachability classification (2026-10-02)

The first run found source High5, API High5 and Web Critical2/High42/Unknown1.
Counts are package records, not unique CVEs. `tools/release/image-security-policy.json`
contains one rule per scope/CVE/package/installed version, CNA/vendor references,
exploit conditions, fix availability and classification. Raw scanner severities remain
visible. No global CVE ignore file is used. Unrecognized findings or changed severity,
expired review, source fingerprint mismatch, or failed runtime evidence block RC.
Review expires on 2026-10-16 and must be revisited before using it thereafter.

The Critical entries refer to the same 32-bit-only OpenSSL CVE in two packages.
The libpng Unknown is Medium according to the upstream advisory. This does not
hide it: raw Unknown and assessed Medium are recorded separately.
The policy applies only to this API/Web HTTP runtime, not the public TLS edge,
operations/migration image, arbitrary upstreams, or future configuration changes.
Before Production use, verify the same HTTP upstream/disabled feature configuration.
No dependency major upgrade or blanket package update was made.

The runner verifies an internal-only anonymous PostgreSQL/API/Web environment
without host ports, readiness, PWA and metadata, multipart rejection, zero restarts,
nginx effective configuration and linked libraries, and absent unused executable.
It creates no formal tenant/staff and performs no Production connection or FINAL.

Contact candidates are compared in memory to the already-approved public legal
contact in both legal source files. Only exact matches are classified as public
business contact; values are never emitted. Each matching file and layer is reported.
Any other candidate remains HOLD. Source files are protected by the same fingerprint.
Image archives are uploaded only after all classifications/content/runtime gates pass.
