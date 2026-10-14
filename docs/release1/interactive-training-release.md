# Interactive Training release audit — 2026-10-14

Scope: isolated Interactive Training and the Help entry only. The formal source baseline is be66f985318e4d03d28ffcdd166ab6e491988d80. API, generator, schema/migrations, authentication, Legal, Setup and formal scheduling conditions are unchanged. Human acceptance of the login/Welcome/home/return path was explicitly PASS before publication authorization.

## Content and UI

Three courses retain 38 / 20 / 6 steps. The existing LoginPage, FirstLoginExperience, HomeDashboard, staff, work-pattern, work-rule, paid-leave, request, calendar, shift, notification, swap and WorkforceReviewStep components are reused. Current MonthlySubmissionPanel and ManagerResolutionCards (via ShiftManagement) now teach the actual category submission and answer/re-evaluation sequence. Zero records and unsubmitted are distinguished. Answers alone cannot finalize; re-evaluation and regeneration gates are exercised.

The registered composition is explained as 23 staff: childcare 18, support 2, food service 3, generation target 20. Four deliberately anonymous examples demonstrate the UI; their quantities and hours are explicitly practice examples. Fixed work does not imply exclusion from all rotation. Work patterns ①–⑨, weekday/date requirements, fixed/support/food work, grants/day/half-day/balance/rate/statutory five days, requests/events/closures, shortages, decisions/answers/re-evaluation, swaps, printing and post-final use are covered.

A4 is the Training print default, including the reused shift screen's print action. No B4 label is shown in Training. A3 compatibility is not promised. DRAFT（下書き）, FINAL（最終決定） and ローテーション are used. Browser/OS installation capability is not inferred: the Windows exercise is conditional on the user confirming the actual browser's install offer. OS-specific PWA/print dialogs remain environment-dependent.

## Isolation and security review

The Training bundle cannot import the production transport or App. All operations use a cloned anonymous in-memory fixture adapter, reject real credentials, and fail closed for unknown methods. An opaque-origin sandbox denies same-origin access, popups and top navigation. connect-src/form-action deny network writes. Parent code accepts bounded progress only from its own sandbox, storing only course and index under its dedicated localStorage key. Production auth/business storage is inaccessible. The sandbox always has its own explicit return control, independent of exit and browser history.

The only regular Web UI change is the Help link. The added nginx location serves static Training without SPA fallback and supplies a separate restrictive CSP. Existing API proxy and application policy are unchanged. Existing runtime vulnerability classifications are reevaluated against this boundary: dependencies, API parsers, nginx modules, upstream/TLS settings and image architecture have not changed. The source fingerprint is updated to bind this reviewed change; individual CVE rules, severity and expiry are not relaxed. A fresh image RC remains mandatory.

## Verification and follow-up

Training functional paths, back/history/resume/restart, keyboard, iframe routes/headings and reuse checks run on Chromium and WebKit, including 390px. Network assertions and fail-closed adapter tests are independent of lesson progress. Existing formal tests are compared with the unmodified baseline when stale source-text assertions fail; such inherited failures are recorded rather than represented as a full regression PASS.

Human approval remains a separate fact from automated test results. No new paid service, registry or runner is introduced. Backup and immutable image deployment preserve the API/DB/edge containers and compare all public-schema table hashes before/after. Final release evidence and exact image/backup hashes are private operational records, with a sanitized outcome in the AI shared log.

Next-version improvements: expand the compact four-person example into a full anonymous 23-person scenario; broaden Windows/iOS/Android physical-device PWA and OS print-dialog coverage; refresh inherited static tests separately. None authorizes changing formal business data in this release.

Existing Web regression: 24/29 PASS; sprint9c, sprint10a, sprint10b, sprint10c and sprint11a fail identically on the unchanged formal baseline. These inherited source-text checks are next-version test maintenance, not evidence of new runtime failures. Training 256 paths, 101-method fail-closed tests, and the four-browser login/return regression pass.

## Fresh advisory classification

The first RC correctly held on three previously unclassified advisories. CVE-2026-90711 (proxy-addr, Critical) requires IPv4-mapped IPv6 subnet trust; this API validates and converts a numeric hop count, now guarded in the RC runtime probe. CVE-2026-93749 (source-map-js, High) belongs to Web build tooling, with no runtime map consumer. CVE-2026-4775 (tiff, High) requires TIFF decoding; nginx has no image filter and does not link libtiff. Exact scope/package/version/severity rules were added with upstream CNA references; expiry and raw severity remain unchanged. No runtime dependency or Production configuration was changed.
