# PRODUCT Phase 3 検証記録

2026-10-15。[設計・残課題](phase3-onboarding.md)。開始HEAD `a60c6554e4176e63606414fcf61fb10cf41498ad`。
環境は既存ローカルDocker PostgreSQL、loopback `127.0.0.1:55439`、DB名 `aen_commercial_isolated`。
接続は既存 `resolveIsolatedDatabaseUrl` と `TEST_DATABASE_ISOLATED=true` で制限。
テストAPI・Webサーバーもloopbackのみ。匿名データを独立作成し、終了時に削除。最終確認でTenant / User / Staff / Invitationはいずれも0件。

## 結果

| 対象 | 結果・範囲 |
|---|---|
| API build | PASS：Nest / TypeScript |
| Web build | PASS：TypeScript / Vite / Training bundle |
| Phase3 HTTP・DB | PASS：126 assertions。匿名園A（職員2名）、園B（5名・2部署・追加パターン） |
| 新規園経路 | 運営者の園作成、独立ADMIN、招待、本人によるパスワード設定、ログイン、園情報、職員・勤務条件・必要人数、準備完了、シフト作成APIまで |
| 招待否定ケース | 未認証ログイン、別Tenant・別ID・不正token・不正形式、期限切れ、再発行前の旧token、使用済み、同時利用（成功1件）、旧User紐付けなし招待を拒否 |
| 認可 | 園ADMINの運営操作拒否、一般職員へのロール変更後にSetupを拒否。別園の職員・部署操作を拒否、別園スナップショット不変 |
| 契約 | 期限不明・期限切れ・将来開始・利用停止で準備未完了と作成拒否。既存Fail Closed単体／HTTP回帰もPASS |
| 秘密情報 | 招待のhash保存、auditに生tokenなし。登録URL・ブラウザ永続領域に招待を入れない設計 |
| レート制限 | 既存認証middlewareを有効にし、新しい公開招待受付の過剰試行を429で拒否 |
| Setup | 初期値の読取だけでは勤務条件・必要人数の確認完了にしない。必須未完了の作成をAPI拒否。任意項目なしで準備完了可能 |
| 法務分離 | 業務準備完了後もtermsAcceptedAt / setupCompletedAtを自動設定しないことを検証 |
| PC Chromium | 実入力・クリック経路PASS、横はみ出しなし、pageerror 0 |
| 390px Chromium | 同上 |
| 390px WebKit | 同上 |
| Migration | 既存30件の内容は基点Gitと同一。31件の適用済みchecksumとファイルSHA256一致 |
| Pilot | `531dde7c504577f9277ae603a2a61bdb83f79a64` のまま、working tree clean。Production接続・変更なし |

ブラウザ検証は各エンジンでさらに別の匿名園をUIから作成。運営者ログイン→園作成→招待受取→不正入力エラー→初回登録→ログイン→園情報→部署→職員登録→勤務条件・必要人数の保存→勤務パターン→準備完了→再読込→ホーム→設定へ戻る、園ADMINによる運営画面の拒否を確認。
フォーム・進む操作が390pxで使用可能。全通信をloopback originに限定し、外部通信0を確認。実機認証・Production検証ではない。
画像は `output/product-phase3/`（Git対象外）に保存。招待秘密情報を消してから運営画面を撮影。

## 再利用した回帰

`npm run test:product-phase2`：PASS。
- 契約単体15件、Fail Closed HTTP
- Feature entitlement、勤務パターン、勤務ルール、職員属性、必要人数、有給の既存匿名回帰
- commercial-onboarding：初期パスワード直渡しから新招待方式に期待値を更新。重複rollback・権限・非複製を維持
- 共通勤務DB制約、126認証routeのguard metadata、Phase2 Tenant境界100 assertions
- production-hardening、必要人数生成13 scenarios、勤務ルール生成30 assertions、固定勤務materializer

Web個別回帰：feature-entitlements 7 checks、initial-password、staff-login-account、setup-wizard、month-utils PASS。
Training adapter：102 API methods、network attempts=0、ロール境界・FINAL／有給／実践課程 PASS。
Training human-path：Mac Chrome、PC Chromium、390px WebKit/Chromiumで既存の練習ログイン→Welcome→ガイド→ホーム→戻る PASS。
Training isolation：CSP、XHR/fetch/beacon/WebSocket/form/image/popup、資格情報・storage分離 PASS。
Trainingの人間受入やProduction公開を今回自動承認したわけではない。

## 失敗と扱い

- 初期実装の型確認でPasswordServiceのdisplayName必須、Staff表示名プロパティを修正し再build PASS。
- ブラウザテストの既存ボタン名誤指定を実UIの「職員を登録」に修正。再実行は全3エンジンPASS。
- 追加のロール回帰でテストがMembershipの単一idを仮定していたため複合キーに修正。再実行PASS。
- Playwright初回は探索パス未指定で停止。既存の同梱runtimeを指定して再実行PASS。追加インストールなし。
- **旧 `npm run test:regression --prefix apps/web` 全体は未PASS**。Sprint9cの「PublicInfoPage内の max-h-[60vh]」という静的期待値で停止。現行は共通LegalDocumentのmax-h-[90dvh] / overflow-y-autoを使用。テスト・両実装ファイルがPhase2基点と完全一致することを比較確認。今回導入の回帰ではない。後続の旧一括テストはこの実行では未実行。
- この不整合は今回のPhase3実画面操作を妨げない。対象を広げて旧Webテスト群全体を改修せず後続課題として残す。全製品回帰PASS・販売RC完了とは報告しない。

## 再実行

APIのbuild、隔離DBへの既存手順によるmigration適用後：

```sh
TEST_DATABASE_ISOLATED=true DATABASE_URL='<loopback isolated DB>' npm run test:product-phase3 --prefix apps/api
```

ブラウザ込み：同じ環境変数に `PHASE3_BROWSER=true` と既存Playwrightの `PLAYWRIGHT_MODULE` を付ける。
事前にWebをローカルレビュー用release metadataでbuildする。外部配信せず、APIと同じプロセスのloopback proxyで検証する。
テスト自身が匿名運営者だけをDBへbootstrapし、顧客園作成以降はHTTP/UIを使う。
異常ケースの期限・ロール操作は隔離DBのfixture操作だけに限定。

## Git・費用・次工程

変更はPRODUCT branchへローカルcommitする。旧Web一括回帰の既存不整合を残すため、今回GitHubへpushしない。
GitHub Actions、PR、追加サービス契約、本番決済、本番接続・反映は実施しない。追加費用0円。
Phase3のオンボーディング経路は完了し、Phase4の一般園月次完成E2Eへ進行可能。
販売規約・公開Gate、自動メール配信、全製品RCは別工程。

Notion詳細：https://app.notion.com/p/3faf7197f53d8149ab4ad0579e4b8f65
