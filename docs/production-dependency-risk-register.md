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

Base images use version tags rather than immutable digests; registry availability and future base-tag changes affect long-term reproducibility. Current clean build success is a point-in-time result, not a guarantee of byte-identical future builds. OS package vulnerability coverage is separate from npm advisory reachability and is not claimed exhaustive here.

## Adoption boundary

No external backup target, provider infrastructure, production secret, formal roster or production DB is part of this source closure. Off-host scripts require explicit configuration and remain disabled in local rehearsal. Runtime Critical/High counts must be rechecked against actual rebuilt images, not inferred solely from a lockfile's propagated package counts.
