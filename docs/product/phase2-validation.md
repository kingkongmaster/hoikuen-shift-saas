# PRODUCT Phase 2 検証記録

実施: 2026-10-14。設計・監査結果は [phase2-safety-settings.md](phase2-safety-settings.md)。
基点9d99350、PRODUCT branch codex/commercial-saas-release。

## 実行・結果

- API `npm run build`: PASS。
- `TEST_DATABASE_ISOLATED=true DATABASE_URL=<匿名ローカル隔離DB> npm run test:product-phase2`: PASS。
  - 契約Fail Closed単体 15/15。
  - 実HTTP/DBで契約欠落時のoverride・書込拒否、初期作成0、他Tenant不変。
  - 既存Feature entitlement、WorkPattern、StaffWorkRule、StaffAttribute、StaffingRequirement E2E。
  - 既存有給E2E：付与、全日/半日、残高、取消/訂正、提案隔離、監査、backup、反復同時実行。
  - 既存commercial onboarding E2E：独立園ADMIN、原子的rollback、初回認証、他園不変。
  - 既存共通職員基盤DB：4正常書込、5複合FK越境拒否。
  - Nest route metadata：122認証対象route、JWTと現在所属確認（旧Tenant作成はHTTP拒否を別確認）。
  - 新Phase2 HTTP/DB：100チェック。2匿名園と運営Tenant、他園read/write拒否、偽装tenantId、
    職員・運営者の権限、旧role token/所属失効、部署CRUD/割当/重複/期間/無効化、実効プランと表示一致。
  - Production hardening回帰。
  - 必要人数generator単体13シナリオ、StaffWorkRule generator30 assertions、固定勤務materializer。
- Web `npm run build`: TypeScript、Vite、Training build PASS。
  ローカル確認専用metadata（releaseId product-phase2-local、buildId phase2-uncommitted-review、
  gitShaは基点9d99350b6c32）を付与。これは確定release artifactではなく公開していない。
- Web `node test/feature-entitlements.test.mjs`: 7 checks PASS。
- `git diff --check`: PASS。

## テスト環境と範囲

既存ローカルcontainer aen-commercial-isolated-db、loopback:55439、
aen_commercial_isolatedのみ。helperで接続先確認。APIは127.0.0.1の一時port。
既存E2Eを匿名fixture harnessへ接続し、staff用メールもexample.invalidのランダム値を注入。
終了後Tenant/Staff/User各0件、既存Migration30件。DBschema・Migration変更/実行なし。
Pilot HEAD 531dde7c504577f9277ae603a2a61bdb83f79a64、working tree clean。
Productionへのアクセス、実データ読取、deploy、決済接続、新規契約はしていない。

APIの実経路とデータ不変性を検証。route guard存在確認だけを認可全体の証明には使わない。
Webはbuild・既存静的検証、契約API同士の日本語機能一覧一致を検証。
今回ブラウザ実機・全端末操作試験や販売Security image RCを実施したとは扱わない。

## 初回失敗と解消

- 新HTTP fixtureのTenantフィールド/enum名と、ログインIDの大小文字を既存schema・認証仕様に合わせて修正。
- 他園workPattern参照は既存仕様で400。実レスポンスと拒否・不変性を確認し、期待値を404から400へ整合。
- 既存属性E2Eが固定demo職員ログインを前提として401。テストを環境変数の職員IDに対応させ、
  harnessで匿名STAFFを作成し、本来の403を検証。認証を緩和していない。
- Web build初回は必須release metadata不足で停止。ローカル確認専用metadataを付与し再実行PASS。
- 既存Feature E2EのTRIAL+ACTIVE+期限なしfixtureは新しい不正契約に相当するため、
  有効TRIALへ修正。不正組合せの拒否は新単体テストで別に確認。

## 費用・公開

追加費用0。既存ローカルDocker/依存ライブラリのみ、サービス契約なし。
GitHub workflowはpull_requestとworkflow_dispatchのみ。PR/Actions起動なし、既存branchへ保存。
すべての関連試験PASS後にcommit/pushする。main/Pilotへのmergeなし。
Phase2完了はPhase3着手可能という意味であり、販売READY・本番公開許可ではない。
