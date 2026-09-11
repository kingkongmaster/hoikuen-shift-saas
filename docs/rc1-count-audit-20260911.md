# RC1 434/465限定監査 — 2026-09-11

> Historical audit checkpoint. Superseded by [final RC1 class audit](rc1-class-audit-20260911.md): PHASE4_RELEASE_GATE_FIX_VERIFIED, API 48/48 PASS. Earlier HOLD findings below are retained as evidence.

判定: 人数差は C GENERATOR_REGRESSION。修正後434件。ただし別assertがFAILしRelease Gate HOLD。

## 根拠と対象
- 基準SHA b0c432eb260b89ae533c551404a5266077ef9d24。Production/旧VPS/正式FINAL未操作。
- 対象2030-01、31日。Tenant 00000000-0000-4000-8000-000000000001。汎用demoを用いたRC1表示回帰fixture。むすび実23名ではない。
- 04832e6 (2026-07-24): RC1/seed作成。当初15名。
- e193de8 (2026-07-28): commit本文で管理者・園長の自動生成除外、15→14名を明示。ADMIN-001除外assert追加。
- bd4e6e2 (2026-08-12): 対象月を2030-01へ移行。8月というassert説明だけ残存。
- eee6e14 (2026-09-04): ContextBuilder抽出時、ADMIN/DIRECTOR取得からDIRECTORのみへ変化。生成側は引き続きmanagerUserIdsで除外するためADMINが漏れた。
- staff追加ではない。人数制限/authentication fixture追加が31件を増やした証拠はない。
- 現Staff総数/active/表示=15。正しい生成対象14、管理用ADMIN-001は表示されるが生成しない。
- isActiveだけで勤務対象とは決めず、既存e193de8の仕様を復元。管理権限を持つ実勤務職員の将来設計を今回新設していない。下位generatorの園長配置設定機能は変更していない。

## 匿名fixture一覧
role NONEはログインMembershipなし。全員active=true、表示対象=true。修正前は全員31行、修正後は勤務14名各31行・ADMIN-001=0。
|匿名職員番号|Staff ID（隔離生成）|Membership role|雇用区分|修正後生成行数|
|---|---|---|---|---|
|ADMIN-001|c92554f6-c6a0-4219-8d0c-d0c4d36ff6e4|ADMIN|FULL_TIME|0|
|STAFF-001|9e1c02dc-d1fe-41c5-a225-04144f00fc1a|NONE|FULL_TIME|31|
|STAFF-002|7d7e6646-8666-49fe-8af8-1eea23f5d8b9|NONE|PART_TIME|31|
|STAFF-003|1f852c09-98e3-43c0-aea2-6f6ef68020a3|NONE|REEMPLOYED|31|
|STAFF-004|f6441c1c-3185-46fe-b7ce-dfba41ae691f|STAFF|FULL_TIME|31|
|STAFF-005|016a3013-a91e-4b33-a79d-b808c2c06b15|NONE|FULL_TIME|31|
|STAFF-006|c18b4ad1-30aa-4b31-95ca-00d5f7c1b7b0|NONE|PART_TIME|31|
|STAFF-007|dc9b7a73-ee33-47f7-b7f6-7f28ee101add|NONE|FULL_TIME|31|
|STAFF-008|b59d8226-fc5e-4361-8be1-39e18c2af841|NONE|FULL_TIME|31|
|STAFF-009|6d9a2d8a-7e6e-471f-8d25-066e7ac1a812|NONE|FULL_TIME|31|
|STAFF-010|5252939b-6c5e-45da-ac73-d2c72f45b3cc|NONE|PART_TIME|31|
|STAFF-011|c00988b5-53c5-4362-9597-c4a9e85e2648|NONE|FULL_TIME|31|
|STAFF-012|c7f79f73-978d-4d5a-a086-8d88cfee423c|NONE|FULL_TIME|31|
|STAFF-013|a50c4560-a16b-4b25-a2a6-ceffac63c962|NONE|FULL_TIME|31|
|STAFF-014|c43df5d4-1b91-454a-b8b0-b5d7576cadc4|NONE|FULL_TIME|31|

## 件数・修正
- 修正前465=15×31。ADMIN-001分31行。staff/date重複0。
- 修正後434=14×31。staff/date重複0。非生成ADMIN-001はactive表示のまま。
- ContextBuilderのMembership取得を従来ADMIN/DIRECTORへ復元（1条件）。
- RC1で14名のコード一覧、表示15名、各31日、重複0、管理者0行を別々にassert。日数を対象月から導出。434を465へ変更していない。
- 既存30 migrations不変、新migrationなし。

## 検証
- 隔離PG16: tmpfs・loopback、30 migrations PASS。架空seedのみ。
- 人数関連assert PASS、RC1全体FAIL: 勤務区分・時刻・配置クラスを保存。
- 配置クラスnullの勤務43行: STAFF-001=4、003=4、004=3、005=1、012=15、014=16。
- assignClassesが勤務行をnullへ初期化し必要人数まで配置する実装を確認。余剰/未配置行の正式扱いまでは今回確定していない。nullを許容するようassertを緩和していない。
- API48コマンド:47 PASS、RC1のみFAIL。tenant isolation、匿名生成、人数制限、週1/2制限・週3禁止、翌日遷移を含む。
- API/Web lint・API build・Beta Web build・Web regression PASS。
- DB role/secret分離・application DDL拒否・migration権限・バックアップ読取権限PASS。
- JSON UI/API制御、②希望、第三金曜会議、固定勤務・給食室、別Tenant非適用のRelease GateテストPASS。
- Critical確定0。High/Release blocker: RC1配置クラス整合1件（深刻度未確定だが検証未完了）。
- PHASE4_RELEASE_GATE_FIX_VERIFIEDは未達。HOLD。commitせず、次は43行の配置仕様照合だけ。

## 作業境界
Production/旧VPS/正式データ未操作。既存のRelease Gate差分維持。commit/push/PR/mergeなし。
git diff --check PASS。今回変更2コード/testファイル＋本監査文書。diffとstatusは別添。
