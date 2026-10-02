# Manual image RC and cost gate

Additional expense of any amount requires prior human approval. Unknown cost is
HOLD. Check billing before workflow creation and again before dispatch. Do not
change billing limits or buy resources to unblock a run.

The authorized scope uses the existing public repository, GitHub Free, standard
ubuntu-24.04, one job capped at 45 minutes, no shared cache or registry push.
Verify current free storage headroom of at least 400 MiB and the existing Actions
$0 budget with stop-usage enabled. Archive + report upload is capped at 400 MiB
with one-day retention. A failed security gate uploads only sanitized evidence.
No paid runners, extra registry, production credentials, SSH, database connection
or automatic deployment are part of this workflow.

Dispatch requires a reviewed 40-character source SHA and explicit cost/source
privacy confirmations. Control scripts come from the workflow commit; API/Web
come from the exact source SHA. Both identities remain visible in the run.
Do not build a moving branch. Human source privacy review is required because
automated contact/file patterns cannot prove absence of all personal names.

Trivy is checksum pinned and fetches a fresh database per run. Critical/High and
UNKNOWN findings are unclassified blockers, including development dependencies
in the conservative source scan. No previous risk exception is automatically
reused. Findings require source-backed manual reachability classification before
any later waiver change. Every image layer is checked for source maps; application
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
