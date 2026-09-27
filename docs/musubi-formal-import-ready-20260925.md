# むすび Release 1 — Formal Import 実装レビュー

## 2026-09-27 最終判定（Source 046）

`MUSUBI-2026-046`（USER_PRODUCT_OWNER_DECISION、Drive原文保管・再取得hash一致・Notion登録済み）により、解消不能な不足を管理者へ正確に返すことを正常系として評価する。園管理者による勤務条件変更の承認ではない。

- `SOURCE_REGISTRY_STATUS = PASS`
- `REPOSITORY_PII_CLEAN = PASS`（現行成果物・到達可能refsの範囲）
- `FORMAL_PII_PACKAGE_ISOLATED_VERIFIED = PASS`
- `RELEASE1_FORMAL_IMPORT_IMPLEMENTATION_VERIFIED = PASS`
- commit可能。人間レビュー待ち。commit / push / Production操作は未実施。

検証月2035-01の残4枠は `EXPECTED_ADMIN_DECISION_CASE`。1月5・12・19・26日の⑥が各必要2名・配置1名・不足1名。自動解決可能な3枠を同一週再配置で解消し、不足7→4を維持する。Production正式不足として登録しない。

必要人数HARD不足の診断4件は保持する。それ以外のHARD違反0、無断週3拡張0、⑤→翌①違反0。既存APIの `BUSINESS_DECISION_REQUIRED` を `ADMIN_DECISION_REQUIRED` と同等の管理者判断分類として使用する。未調整の不足はDRAFTのままで、確定は409で拒否する。

既存UIで対象日・勤務番号・必要/配置/不足人数・週2救済でも解消不能な理由・管理者判断が必要なことを表示し、手動調整を利用する。内部コードだけで判断させないため、Masterの必要人数表示名を①〜⑨へ、生成警告を人数と理由が読める文言へ最小修正した。条件・探索・確定保護は変更しない。

今回の検証：API lint/build、Release Gate（formal-source含む）、同一週再配置回帰PASS。表示修正前後のMaster書込引数は表示名以外同一、33件の作成/更新表示名が一致。生成結果は警告文言以外の割当・人数・診断分類・公平性・探索集計が同一。実際のconfirmメソッドをDB接続なしで検証し、未解決警告に対して409・書込0。Web・Tenant分離・DB role・JSON Beta・CSV/printは変更のない実装に対する既存PASSを継承する。新SHAからのclean rebuild/regressionはcommit/push後の別工程。

27ファイルをレビュー。追加ファイル数は維持。PII/secret検出0、migration/lockfile差分0、temporary bypass/debug追加0。Matrix039の598項目（生成必須457）の出典を維持し、035〜038の暫定区分をAPPROVEDに変更していない。氏名は001、勤務条件は039の正式PII packageを維持。既存隔離検証の23名・20＋3・dry-run書込0・再適用業務差分0・別Tenant差分0・cleanup PASSを継承する。

到達不能Git PII4個は `UNREACHABLE_GIT_PII_CLEANUP_OPEN_ITEM`、過去ツール出力は `HISTORICAL_TOOL_OUTPUT_PII_OPEN_ITEM` として残す。消去済み・過去漏えい0とは判定しない。

次工程：人間レビュー → commit → push → 新SHA clean rebuild/regression → Production直前backup → 正式Tenant → 正式23名package → Production validation → domain/HTTPS → 390px/PWA/B4実機受入 → Release 1完成。次の1操作は人間レビュー。以下の9月25日記録は当時の判断として保持する。

---

2026-09-25。判定：**FORMAL_IMPORT_DRY_RUN_READY**。
これは正式データ取込の隔離検証へ進める実装状態を示す。Production投入の承認・Release完了を意味しない。

| 項目 | 結果 |
| --- | --- |
| A. branch / worktree | `codex/musubi-formal-import-ready-20260925` / `~/Desktop/aen-musubi-formal-import-20260925`。基準・現在HEADとも `f3300dcdfe7885a231035492bbcb662c587f2bee`。開始時clean、専用worktreeで作業。元の固定RC worktreeもcleanを維持。 |
| B. 実変更ファイル | 下記一覧。APIの取込・生成・検証と匿名テスト、入力契約・報告書。Webコード変更なし。 |
| C. P05 | 平日⑤を10:00–18:30へ訂正。旧10:30はadapterの値照合で拒否。 |
| D. S019 / S020 | S019は平日EARLY、土曜出勤時P07、休暇優先。S020は平日08:45–17:15、土曜P07。旧package由来のS020土曜固定ルールだけ無効化して履歴保持。 |
| E. S016 | 共通P02は08:00–16:30。個人時刻は08:00–16:40。固定ルールの個人時刻を生成にも使用。土曜HARD休み、土曜defaultで上書きされない。 |
| F. その他個別rule | S012 AGE_0・EARLY月1回HARD上限、S003水曜NO_ROTATION（出勤・必要人数へ不算入）、S013火曜EARLY/NORMAL・木曜LATE禁止。曜日限定の利用可能パターンを他曜日へ拡張しない。パターンIDを区別しP02/P03等をOTHERとして混同しない。 |
| G. provisional P09 | 10:30–18:00、`PROVISIONAL_PENDING_ADMIN_CONFIRMATION`。管理者承認とはしない。Tenantの既存WorkPattern変更経路を維持。後日P09が変更された場合、旧Master再適用は停止する。 |
| H. operational default | 未記載部分だけ`RELEASE1_OPERATIONAL_DEFAULT`。037はユーザー判断。契約情報にはしない。明示条件・固定・休暇が優先。給食3名へrotation defaultなし。Matrixの一部土曜候補にあるAPPROVEDは、候補という運用値の管理者承認に読み替えず、実装側の値分類をdefaultとして保持。元のMatrix記録も保持。 |
| I. provisional SOFT | S006/S007のLATE翌日P03、S006のEARLY水曜回避・月1回程度を候補順位へ接続。HARD適格性判定後、公平性より前に評価。SOFT不成立で候補を禁止しない。SOFTで別の必須枠を悪化させた場合、SOFTなしで一度だけ再探索しHARD優先の結果へ戻す。INFOでその理由を返す。 |
| J. 年間目標 | 日次×260による契約生成を削除。0や推測値も生成しない。年目標未設定の固定3名は、承認済み時刻のAVAILABLE_TIME_RANGE（勤務可能時間帯）を事前検証し、生成APIでも同じ結果を使用。既存の単一契約による検証経路を維持し、複数契約を時間帯で回避しない。 |
| K. adapter | formal package→schema/意味検証→既存importer DTO（取込形式）→既存DB対応を実装。`--formal-package --admin-employee-number Sxxx`で既存importerに接続。値はMatrix039の固定入力契約と照合し、未承認の変更は拒否する。 |
| L. provenance | 出典をたどる情報。各入力値にSource ID、承認状態、判断者種別、適用期間、派生元を保持。TenantFeature.configuration.release1SourceProvenanceへ保存。匿名Matrix598項目・必須457項目の出典対応も保持。loaderの実行者・実行日時を管理者承認として記録しない。 |
| M. validation | 23名、部門18/2/3、自動生成20＋固定給食3、給食rotation0、重複ID・必須出典欠落拒否、P05/S016/P02/P09/SOFT等を検証。adapter否定テスト14件PASS。Matrix039原本hashと匿名対応表598項目の一致を確認。 |
| N. regression | 下記対象回帰PASS。匿名23名で実際にadapter→importer→Master→隔離DB→生成APIまで確認。年間契約0件、給食固定勤務93件（31日×3名）、S016個人退勤16:40。2回目業務差分0、他Tenant差分0。 |
| O. migration差分 | 新規0、schema差分0。隔離PostgreSQLへ既存30件を適用。API/Web lockfile差分0。 |
| P. SOURCE_REGISTRY_STATUS | `NOT_REQUIRED_NEW_SOURCE`。既存035〜039のPASSを継承。新規外部資料なし、再探索なし。031/032は039内の項目単位の根拠として参照。 |
| Q. Gate | `FORMAL_IMPORT_DRY_RUN_READY`。`FORMAL_DATA_SOURCE_VERIFIED = PASS`を維持。 |
| R. commit可能状態 | 技術検証・diff --checkはPASS。未commit・未push。ユーザー指示どおり人間レビュー待ちで停止。 |
| S. 次工程 | 人間レビュー後、隔離PostgreSQLで正式PII packageの検証へ進む。原本を変更せずGit外・制限された保管場所で作成。正式PII package未作成・未書込。対象月の希望休・行事、Production投入承認は別Gate。 |

## 変更ファイル

`apps/api/`以下：

- `package.json`：新規のformal-source回帰を既存Release Gateへ接続、隔離取込テストの実行口。
- `scripts/apply-musubi-tenant-master.cjs`：Master適用、実値検証、年間推測契約の除去、出典保存、旧S020ルール整理。
- `scripts/import-musubi-beta.cjs`：adapter接続、出典保存、部門割当の再適用で行数を増やさない処理。
- `scripts/lib/formal-package-adapter.cjs`：schema/意味検証とDTO変換。
- `scripts/lib/formal-package-file.cjs`：隔離テスト用のGit外・所有者・600/700権限・非symlink入力。Productionでは従来の読み取り専用Linux mount guardを維持。
- `scripts/validate-musubi-formal-package.cjs`：DB書込なしの検証CLI。出力は件数・hashのみ。
- `src/application/shifts/approved-fixed-time.ts`：出典付き時間帯による検証。
- `src/application/shifts/provisional-soft-rules.ts`：SOFT設定読込と優先度計算。
- `src/application/shifts/generation-preflight-validator.ts`：固定勤務とSOFT設定の事前検証。
- `src/application/shifts/monthly-generation-context-builder.ts`：勤務ルールの出典読込。
- `src/application/shifts/rule-based-shift-generator.ts`：SOFT評価、HARD優先の再探索、勤務パターンの個別識別。
- `src/application/shifts/staff-work-rule-evaluator.ts`：曜日限定と個人固定時刻の評価。
- `src/presentation/shifts/shifts.service.ts`：生成APIへの接続。
- `tenant-packages/musubi/permanent-master.cjs`：匿名Masterの最小訂正とSource参照。
- `tenant-packages/musubi/formal-package.schema.json`：既存設計schemaを実装へ配置。
- `tenant-packages/musubi/formal-input-contract.json`：匿名ID・値・Source参照からなる検証用対応表。正式原本・PII packageではない。
- `test/formal-package-adapter.test.cjs`
- `test/formal-package-file.test.cjs`
- `test/musubi-formal-runtime.test.cjs`
- `test/formal-import-isolated.e2e.cjs`
- `test/helpers/anonymous-formal-package.cjs`：合成名のみ。正式PII packageとして利用しない。
- `test/generation-preflight-validator.test.ts`
- `test/staff-work-rule-generator.e2e.cjs`：現RCの取得失敗時安全停止に期待値を更新、隔離DB guardを追加。

本報告書：`docs/musubi-formal-import-ready-20260925.md`。

## 検証記録

API lint/build、Web lint/build：PASS。Web buildは既存要件の`AEN_RELEASE_METADATA`を指定し、ローカルreview buildとして検証。配信・デプロイなし。

APIの対象回帰：

- `test:release-gate`（パターン識別、JSON guard、必要人数、固定勤務、Production操作guard）
- `test:formal-source`（adapter・ファイル保護・Master/生成SOFT）
- `test:generation-preflight`
- `test:staff-work-rule-generator`
- `test:weekly-work-pattern-group`（週1・不足時週2・週3自動拡張禁止）
- `test:rc1-director`（ADMIN除外）
- `test:fixed-class`、`test:individual-hours`
- `test:annual-fairness`（既存契約を利用する処理の回帰）
- `test:staff-importer`、`test:db-safety`

隔離DB/APIの対象回帰：

- `formal-import-isolated.e2e.cjs`：匿名23名、取込前dry-run書込0、再適用業務差分0、別Tenant変更0、個人時刻・出典保存、固定勤務の生成API。
- `release-role-isolation.e2e.cjs`：PostgreSQL16、30 migration、app/backup/migratorの権限分離。
- `tenant-phase1-db-constraints.e2e.cjs`：正常7ケース、別Tenant参照6ケース拒否、WorkPattern削除制約。
- `release-fixed-staff.e2e.cjs`：従来の正式契約がある固定3名の生成経路を維持。
- `technical-json-api.e2e.cjs`：BetaのJSON操作禁止、認証、CSV/printを維持。
- `staff-work-rule-generator.e2e.cjs`：固定/利用可能/禁止、保存、監査、Feature無効・取得失敗。障害注入にはmigrator権限、API本体はapp権限を使用。

Web対象回帰：`test:release-gate`、`test:work-patterns`、`test:staff-work-rules`、`test:individual-hours`、`test:musubi-beta-scope`、`test:shift-display`。

テスト調整：Web build初回はRelease metadata未指定で停止したため、review情報を指定して再実行しPASS。旧APIテストの障害注入はappロールの権限制限で正しく拒否されたため、テストセットアップのみmigratorで実行。旧テストの「取得不能でも継続」という期待値は、固定RCに既にあるpreflightの安全停止仕様へ合わせた。業務ロジックの安全停止を緩めていない。

再適用差分0の定義：職員・部門割当・勤務ルールの業務値とIDが同じ。実行監査の追記・updatedAtの変更は業務差分から除外。Productionに対するdry-runは実行していない。

## 次工程の実行口と制限

`apps/api`で`npm run build`後、`npm run test:formal-source`。DB統合テストは明示したlocalhostのtest/isolated DB、`TEST_DATABASE_ISOLATED=true`、`DEPLOYMENT_ENV=test`、ローカルAPI、テスト用認証設定が必要。`npm run test:formal-import:isolated-db`は合成名23名だけを使用する。

正式packageの検証口は`node scripts/validate-musubi-formal-package.cjs <Git外package.json> <匿名管理者ID>`。取込口は`node scripts/import-musubi-beta.cjs <Git外package.json> --formal-package --admin-employee-number <匿名管理者ID>`。`--apply`がなければ取込書込をしない。Productionの既存環境確認・dry-run receipt・明示承認・readonly mount要件は残している。

現adapterはMatrix039に固定されたRelease1の入力契約であり、別の正式値を受領した場合はSource Registryに沿って入力契約を更新する。将来の値を旧039の値へ黙って変換しない。新規年間契約も今回のpackageからは作らない。既存の正式年間契約は別の承認経路で維持する。

SOFTは最適解の保証ではない。HARD条件を破らず優先順位を付け、必須条件が悪化する場合は暫定SOFT優先を見送る。対象月に実際の不足が残る場合は既存の管理者判断経路へ返す。⑤→翌①や週3以上をAIが解除しない。

## 保護・不変条件

- Production接続・write・migration・Tenant作成・正式PII write・FINAL再生成：0。
- SSH/鍵/password/VPS/DNS操作：0。
- commit / push：0。人間レビュー待ち。
- 原本の移動・上書き・削除・upload：0。
- 検証は専用ローカルDB `aen_formal_test`、127.0.0.1:55439とローカルAPIのみ。終了時APIとテスト用コンテナを停止。
- API lock SHA-256：`b089dd61094d25d6014a6d09f0f4930e64f0bbede81eb890dcdc90e44b442d53`。
- Web lock SHA-256：`412bdefe187db6174211a77863ac31d8a797d3173f7cedee2bd79dd45c025284`。
- Matrix039 SHA-256：`6db2e20d95802e185f2d21801dc513a1fd3b9f752c3544a393391229643869cb`。
- `git diff --check`：PASS。新migration0、lockfile差分0、元RC worktree差分0。

Source参照：[MUSUBI-2026-039](https://www.notion.so/3e6f7197f53d813cb681f8c6f41e185c)、[036](https://www.notion.so/3e6f7197f53d8117a2d7d28ef1a44851)、[037](https://www.notion.so/3e6f7197f53d81babe9ade69f3ba06ee)、[038](https://www.notion.so/3e6f7197f53d81f2ad55c4f98657eef8)。
