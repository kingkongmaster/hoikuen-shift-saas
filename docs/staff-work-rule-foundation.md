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

## Generator integration specification

Generator接続時の評価順序は、休園日、承認済み休暇、PROHIBITED（勤務禁止）、FIXED（固定勤務）、ALLOWED（勤務可能）、勤務上限・連続勤務制限、HARD配置条件、PREFERRED（希望勤務）、SOFT配置条件、公平性評価の順とする。

FIXEDが休園日、承認済み休暇またはPROHIBITEDと競合した場合は上位条件を優先し、勤務を割り当てない。Generator処理自体は停止せず、競合理由をERRORまたはWARNINGで返す。ALLOWEDは勤務候補として選択可能であることだけを意味し、優先配置には使用しない。候補が複数の場合はPREFERREDを先に比較し、それでも同順位なら既存の公平性評価で決定する。

既存rule typeとの対応は、FIXED=`FIXED_WORK_PATTERN`、PREFERRED=`PREFERRED_WORK_PATTERN`、ALLOWED=`AVAILABLE_WORK_PATTERN`・`AVAILABLE_DAY_OF_WEEK`・`AVAILABLE_TIME_RANGE`、PROHIBITED=`UNAVAILABLE_WORK_PATTERN`・`UNAVAILABLE_DAY_OF_WEEK`・`UNAVAILABLE_TIME_RANGE`・`REQUIRED_DAY_OFF`とする。`startDate = endDate`は特定日、両方nullは無期限を表す。曜日と期間を併用したルールは両方が一致する日にだけ適用する。

FIXED評価時はALLOWEDを参照しない。ALLOWEDはFIXEDではない通常・早出・遅出・その他勤務候補の選定だけを制限する。`AVAILABLE_DAY_OF_WEEK`は適用期間内の許可曜日リストであり、複数ルールは和集合とする。PROHIBITEDと重なる場合はPROHIBITEDを優先する。

Feature `STAFF_WORK_RULES` がOFF、状態取得に失敗、または有効ルールが0件の場合はStaffWorkRuleを適用せず、勤務割当結果を従来Generatorと同一に保つ。状態取得失敗時もGeneratorは停止せず、管理者へ内部例外を含まないWARNINGを返し、AuditLogにはフォールバック発生を件数・種別の要約として記録する。WARNINGが追加されるためレスポンス全体の完全一致は要求しない。園名、職員名、園固有人数は共通評価器へ埋め込まない。

Webは375px、390px、412pxでは横スクロール表に依存せずカード表示へ切り替え、編集、無効化、再有効化、保存および入力エラーを操作可能にする。無効化と再有効化は確認画面を経由する。
