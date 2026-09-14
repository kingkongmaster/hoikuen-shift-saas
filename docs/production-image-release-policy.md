# Production image release policy

Generate public metadata with tools/release/create-metadata.mjs (Git HEAD and current UTC; dirty review marker). CI supplies the generated JSON explicitly to Web build. Use tools/release/build-images.mjs with one explicit metadata JSON and a new output manifest path. Only product, releaseId, buildId, gitSha (12 lowercase hex characters), builtAt (UTC seconds) are public. Product is AeN Shift. Release/build IDs are public identifiers, never credentials. Production Vite builds fail without valid metadata; development uses a visibly non-release identity. No process environment serialization is permitted.

The same validated object supplies both image labels, the release manifest, served release-metadata.json and compiled Web UI constants. tools/release/verify-images.mjs checks built artifacts against the manifest. Registry digest and local image ID are different: the manifest records imageId and repoDigests separately. No push is required for a local review image.

For uncommitted review builds, preserve an explicit source file allowlist and per-file SHA-256 manifest outside the repository. Record base commit and dirty=true. Do not claim the base commit alone reproduces a dirty review image. Copy no untracked local data, environment files, credentials, rosters or host dependencies into the source snapshot. Commit and rebuild from the new clean SHA require a subsequent approval.

Base pins were re-resolved from docker.io/library/node and docker.io/library/nginx on 2026-09-14 using docker buildx imagetools inspect with the digest. They are the previous review's same image families, not a major upgrade:

- node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
- nginx:1.27.5-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

Both indexes contain linux/amd64. Digest pinning follows https://docs.docker.com/build/building/best-practices/ . Pinning does not itself fix vulnerabilities. Inspect current image versions and scan current artifacts.

A release requires lint/build/regression, health/readiness, PWA asset delivery, metadata consistency, secret/PII checks, no public source maps, Compose static safety, SBOM and a current Critical/High inventory. Classify architecture exclusions, duplicates, conditional exposure, non-reachability and build/development dependencies with concrete evidence. UNKNOWN is a blocker; raw scanner counts need not be zero. Reevaluate on architecture, configuration, parser, base, TLS or domain changes. Static boundary tests supplement, not replace, runtime observations.

Retain buffers 0.1.1 as DEV_ONLY_LICENSE_OPEN_ITEM only after checking it is absent from both runtime images. Do not infer an unverified license. Preserve the existing migration dependency risk register. Public distribution retains an independent OSS/IP gate. Domain/HTTPS and Caddy remain a separate gate.
