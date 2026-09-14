# Production dependency risk register

Status: local-only RC candidate; formal adoption is pending. Baseline eee6e1481891dd75e0b5ae394666cf2b4780edf0; dependency fix source 9df5f7b8d6cbd3ade0229aceebda14c3cb5ccf52.

## Internal migration High: explicit conditional non-blocker

- Package: deepmerge-ts 7.1.5.
- Advisory: GHSA-ggr8-5vv4-36mx / CVE-2026-40345; https://github.com/advisories/GHSA-ggr8-5vv4-36mx.
- Chain: migration/package.json -> prisma 6.19.3 -> @prisma/config 6.19.3 -> deepmerge-ts 7.1.5.
- Exploit condition: merging both inputs containing recursive self-referencing JavaScript objects can cause nontermination/DoS. Plain JSON cannot express those object cycles.
- Exposure: Prisma CLI/config dependencies exist only in the migration image. API, operations, Web and backup do not contain this package. The migration service has no HTTP/API listener or published port and runs an explicit job against a fixed schema.
- Isolation conditions: only approved image and immutable schema/migrations, no arbitrary prisma.config.* or external configuration code, no user-controlled JS objects, internal database network, explicit production target confirmation and migration permission guard. Do not treat a writable executable/config mount as equivalent isolation.
- Risk judgment: INTERNAL_OPERATIONS_ONLY, conditionally non-blocking for the current configuration. Ability to replace the image/configuration is outside an unauthenticated runtime request path. Preserve the finding; reassess if CLI/config usage, mounts, network exposure or trust assumptions change.
- Fixed version: 8.0.0 (major). Not applied in this scope. No npm audit fix --force and no major upgrades.

## Other retained development-only advisories

- tmp 0.0.33: GHSA-ph9p-34f9-6g65 (High) and GHSA-52f5-9888-hmc6 (Low), unused external-editor/inquirer path in development dependency tree; absent from distributed images.
- uuid 8.3.2: GHSA-w5hq-g745-h8pq (Moderate), unused ExcelJS path / affected buffer APIs; absent from distributed images. Major update deferred.
- webpack 5.97.1: GHSA-8fgc-7cc6-rx7x and GHSA-38r7-794h-5758 (Low), experiments.buildHttp not used; absent from distributed images. Avoid indirect major dependency change.

## Reproducibility limitation (Medium)

API/Web base images are now pinned to the previously reviewed immutable digests (see production-image-release-policy.md); registry availability and build timestamps still affect long-term reproducibility. Current clean build success is a point-in-time result, not a guarantee of byte-identical future builds. OS package vulnerability coverage is separate from npm advisory reachability and is not claimed exhaustive here.

## Adoption boundary

No external backup target, provider infrastructure, production secret, formal roster or production DB is part of this source closure. Off-host scripts require explicit configuration and remain disabled in local rehearsal. Runtime Critical/High counts must be rechecked against actual rebuilt images, not inferred solely from a lockfile's propagated package counts.


## 2026-09-14 image reconstruction review

Evidence-based reimplementation, not recovery of the lost temporary worktree or patch. Uncommitted review source based on 8f78fa9120d62cff907efbd8ee2668b1ff05364d. Human approval covers local implementation and isolated tests only; no production operations or commit.

Fresh Trivy 0.74 scan: API raw C0/H5/M6/L13; Web raw C2/H34/M49/L26. All 41 Critical/High package/CVE rows were reassessed against new linux/amd64 artifacts. Classification: 1 architecture exclusion, 9 duplicate rows, 19 base-library non-reachable, 11 conditional, 1 supported false positive. Current HTTP runtime Critical/High blockers 0/0; unknown 0. This is not a claim that the packages are patched.

- Web CVE-2026-31789: 32-bit-only upstream condition; rebuilt images are amd64. https://openssl-library.org/news/secadv/20260407.txt
- API OpenSSL QUIC: no QUIC listener; rebuilt Node has no dynamic OS libssl linkage. https://openssl-library.org/news/secadv/20260813.txt
- API multer 2.2.0: no multipart parser registration or Nest upload interceptors; source boundary test passed. Enabling upload requires reevaluation and patched multer. https://expressjs.com/en/blog/2026-08-31-security-releases/
- Web XML/PNG/Expat/c-ares/nghttp2: rebuilt nginx not linked to these libraries and nginx -T has no dynamic modules, transforms or HTTP2 route. Serving PNG bytes is not parsing images.
- Web OpenSSL: HTTP listener and upstream only; no attacker-controlled CMS/PKCS12/DANE/delta-CRL path. https://openssl-library.org/news/secadv/20260127.txt and https://openssl-library.org/news/secadv/20260407.txt
- musl: amd64 threshold exceeds 34 trillion elements; tested Web memory 96MiB and no huge-array API. Preserve this resource/config boundary. https://www.openwall.com/lists/oss-security/2026/04/10/13
- zlib CVE-2026-22184: affected contrib/untgz utility absent in rebuilt rootfs; not core compression. https://github.com/madler/zlib/issues/1142

Reassess all exceptions when base, architecture, runtime features or configuration changes. Caddy/domain/HTTPS are outside this review and remain a separate gate. Full per-row package/version/fix/reference classification and raw scan are retained with the local release evidence.

buffers 0.1.1 is lockfile dev-only, npm upstream registry.npmjs.org/buffers, license metadata absent. Both rebuilt runtime inventories contain zero buffers. Classification DEV_ONLY_LICENSE_OPEN_ITEM remains open before public OSS distribution; do not label its license as resolved.
