# PRODUCT Phase 1 検証記録

実施日: 2026-10-14。対象: `codex/commercial-saas-release`。
採用範囲は[統合基準](phase1-integration-boundaries.md)、全46件は[分類表](phase1-commit-decisions.md)。

## 実行結果

| 検証 | 結果 |
|---|---|
| API `npm run build` | PASS |
| API `npm run test:product-phase1` | PASS（以下を一括再実行） |
| subscription-fail-closed.test.cjs | 9/9 PASS。欠落・未知値・期限不明・DB失敗、全Feature、override順序、既知状態 |
| subscription-fail-closed.e2e.cjs | 実Nest/HTTP/Postgresで拒否・正常系・ロール・他Tenant不変・拒否時初期作成0を確認 |
| product-phase1-regression.e2e.cjs | 既存feature-entitlements/work-patterns E2E PASS。匿名8名、loopback一時port |
| commercial-onboarding.e2e.cjs | 導入権限、無効時拒否、原子的rollback、管理者独立、password失効、Setup、sentinel PASS |
| common-workforce-foundation.e2e.cjs | 4正常書込・5越境FK拒否 PASS |
| production-hardening.test.cjs | PASS |
| Web feature-entitlements.test.mjs | 7 checks PASS |
| tools/release/image-rc.test.py | 10/10 PASS（RCツールの単体テスト。販売イメージRCそのものではない） |
| 分類表と固定SHAのrev-list集合照合 | PRODUCT42/main4、欠落・重複0 |
| git diff --check | PASS |

## 隔離・不変条件

- 既存ローカル一時Postgres、`127.0.0.1:55439/aen_commercial_isolated` のみ使用。
  `TEST_DATABASE_ISOLATED=true` と既存helperで接続先を検査。実データの複製なし。
- 終了時Tenant/Staff/Userは各0件、適用済みMigrationは30件。今回Migration実行なし。
- schema/Migration/generatorの変更なし。Production接続・デプロイ・課金接続なし。
- Pilot HEAD `531dde7c504577f9277ae603a2a61bdb83f79a64`、working tree cleanのまま。
- GitHub workflowは手動またはPR起動のみ。PR/Actionsは起動せず既存PRODUCT branchへ保存。
- 新規有料サービス・追加リソース契約なし、追加費用0。

## 開発中に検出・解消した事項

- 勤務パターンGETが契約確認前に初期行を書いていた。Feature判定後に初期作成する順序へ修正。
  拒否HTTP後のDB行数を検査する回帰テストを追加。
- 新規E2Eの入力不足による400、sentinel比較タイミング、既存生成テストに必要な匿名職員不足、
  Nest標準body上限による413はテストharnessを修正。入力検証・本体上限を緩和していない。
- 停止契約の一覧閲覧は既存のread-only仕様を維持。書込拒否と初期作成抑止を検証。
- RCテストの初回はPyYAML不足で1件ERROR。`/tmp/aen-phase1-rc-venv`へ
  PyYAML 6.0.2を入れ再実行し10/10 PASS。repository依存や本番Pythonは変更していない。

## 判定と限界

Phase1完了、Phase2へ進行可能。販売READY・本番公開承認ではない。
一般園の全画面E2E、販売法務、最新Security/image RCは後続Gate。
既存security policyのfingerprintを今回の変更に合わせて書換え、PASS扱いにはしていない。
欠落契約を持つTenantはPRODUCT修正適用後に拒否される。配備前に正当な契約状態を棚卸しする。
PAST_DUEの既存猶予は維持。すべてのGETを無書込にしたわけではない。
Windows専用配布器・販売規約本文は判断待ち。クラス/雇用enum一般化は設計を先行し、重大DB変更前に確認する。
