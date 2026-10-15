# PRODUCT Phase 3 最終ゲート：旧Web回帰の整合とGitHub保存

2026-10-15。開始HEAD `5a20cd5aee95c3a86a5d1c02d5c0106237d2402f`。
対象は `/Users/kojimacair/Developer/aen-shift-commercial`、branch `codex/commercial-saas-release`。
Phase4実装は開始しない。変更はWebテストと本記録のみ。

## 原因分類と証拠

**主分類C（現在の仕様へ旧静的チェックが未追従）、B（Phase3以前から存在）、D（期待値側の問題）。A（Phase3による機能回帰）ではない。**
最初の停止は `test/sprint9c.test.mjs` の `AssertionError: 規約画面はスクロール可能`。
一括スクリプトは `&&` 接続のため、その後の旧期待値不整合は未実行だった。
今回29スクリプトを個別監査し、5スクリプトの失敗と、先行assertに隠れた期待値を全て比較した。

| 対象テスト | 古い期待値 | 現行仕様・由来 | 更新した検証 |
|---|---|---|---|
| sprint9c | PublicInfoPage内の `max-h-[60vh]` / `overflow-y-auto` | `7dd2265`で全文をLegalDocumentへ共通化。公開ページはページスクロール、同意本文dialogは90dvh以内のスクロール | 公開2routeの共有部品接続、全条項描画、dialogの高さ・スクロール・開閉・フォーカス復帰。実ブラウザでも全文・スクロール・戻るを確認 |
| sprint9c | `Trial終了日` | Phase2 `a60c655`で日本語優先の `試用終了日` | 日本語ラベルだけでなく `subscription.trialEndsAt` との表示結合を検証 |
| sprint9c | `contactName: draft.tenant.directorName.trim()` | `b09b161`で既存プロフィール構造と未変更項目を保持するprofile mappingへ移行 | 実関数を呼び、氏名読込・未変更時PATCHなし・変更時trim・他項目非上書きを検証。Wizard→API接続も確認 |
| sprint10a | 512px PNGにmaskable指定 | `a16008e`で通常192/512 PNGと独立した `sizes:any` maskable SVGへ分離 | 現行manifestの役割分離、参照ファイル存在、PNG実寸、SVG viewBox、外部資産非依存を確認 |
| sprint10a | `startsWith('/api/')`、引数なしregister呼出の文字列 | 同commitで `/api` 自体も除外する正規表現、`updateViaCache:'none'`付き登録へ更新 | 実workerをVMで実行し、API・認証付・非GET・query・外部origin・private経路の非キャッシュ、明示更新、offline fallbackを検証 |
| sprint10b / sprint10c / sprint11a | `enshift-shell-v12-print-calendar` | 同commitでv13スタッフPWAへ更新 | 固定cache名を探さず、installで使ったcurrent cacheを残し旧アプリcacheだけ削除する実動作を検証。既存pwa-shellテストを再利用・拡張 |

上記期待値の対象7実装ファイル（PublicInfoPage、LegalDocument、SubscriptionInfo、profile-mapping、main、sw、manifest）はPhase2 `a60c655` とPhase3 `5a20cd5` のblob内容が完全一致。
由来commitもPhase2以前の祖先であることを確認。
法律本文・同意ルール・PWA実装・アイコン・本体UIの仕様を今回変更したわけではない。Pilot用規約を販売版最終規約として新たに承認したものでもない。

## テストを弱めていないこと

テスト削除、skip、失敗無視はしない。旧文字列チェックを機能上の契約に置換。
既存 `pwa-shell.test.mjs` を4つの旧Sprintテストから実行し、二重の古いversion固定を残さない。
検証用の一時コピーで次の8種の故障を個別注入し、全て失敗として検出した（本体workspaceは変更せずコピーは削除）。

1. APIキャッシュ除外の削除（APIへのnavigateも検証）
2. Authorization付きリクエストの除外削除
3. install時の強制skipWaiting
4. 旧アプリキャッシュを削除しない
5. manifest参照maskable資産の欠落
6. 法務dialogのスクロールを無効化
7. 園長氏名をprofile mappingから除外
8. 試用終了日を誤った契約開始日に結合

## 最終再検証

- `npm run test:regression --prefix apps/web`: **29スクリプト全てPASS**。
- `node apps/web/test/legal-document-parity.test.mjs`: PASS。本文hash・API/Web一致は維持。
- `public-legal.browser.mjs`: PC Chromium / 390px Chromium / 390px WebKitで全文、全条項、16px以上、縦スクロール、横はみ出しなし、ログインへ戻る、pageerror 0、API通信0を確認。
- API build、Web TypeScript/Vite/Training build：PASS。ローカル確認用release metadataのみ使用。
- Phase3匿名オンボーディング：**HTTP/DB 126 assertions PASS**。
- Phase3実操作：PC Chromium / 390px Chromium / 390px WebKitの園作成→招待→初回登録→ログイン→部署・職員・勤務条件・必要人数→準備完了→再読込→ホーム→戻るがPASS。外部通信0。
- `npm run test:product-phase2`：PASS。契約単体15件、Tenant境界100 assertions、route guard126件、既存Feature・勤務ルール・有給・生成関連回帰を含む。
- `git diff --check`: PASS。

隔離DBは既存loopbackの `aen_commercial_isolated`、既存安全helperを使用。匿名fixtureのみ。
今回Migrationは追加・変更・実行しない。本番接続・実データ利用・Pilot変更なし。

## GitHub保存と範囲

Phase3本体commitと今回のテスト修正commitを現在のPRODUCT branchへ通常pushする。
公開repository、当該branchのopen PR 0、workflowはPRまたは手動のみでpush triggerなしを確認。
force push、PR作成、Actions手動起動、デプロイを行わない。追加費用0円。
最終SHA、local / origin / GitHub一致、ahead/behind、clean確認はNotion追記と完了報告に記録する。

旧記録の「Web一括未PASS／未push」は当時の履歴として残し、この最終ゲート結果で更新する。
Phase4へ進行可能。今回Phase4のコード・DB変更は開始しない。販売法務や本番公開Gateは引き続き別工程。
