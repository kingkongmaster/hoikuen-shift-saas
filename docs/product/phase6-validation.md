# PRODUCT Phase 6 検証記録

2026-10-18 / PRODUCT / 基点 e759b79319a1276ba59a730b67dcef91bc3a016f。
対象は `Developer/aen-shift-commercial`、branch `codex/commercial-saas-release`。
MUSUBI/Pilot、本番DB・課金・本番環境は未接続・未変更。匿名fixtureのみ。

## 実装範囲

- 追加Migration `202610180001_product_support_applications`：申込/同意、問い合わせ、返信の3テーブルと参照・索引のみ。既存Migration編集なし。
- ProductSales公開プレビューと承認前API拒否、匿名承認fixtureで申込→既存Tenant作成→招待。
- 運営者本人確認と申込ロック・Tenant関連付け。申込による自動有料化なし。
- サポートAPI/既存お問い合わせ入口・運営画面・契約停止画面。送信者本人/運営者の境界。
- 契約停止例外は問い合わせの正確なroute/methodだけ。業務機能やFeature Guardを開放しない。
- generator、認証方式、課金、Pilot規約の承認フラグは変更なし。
- 価格/法務/運営Runbook/販売Gateは別文書参照。

## 実行結果

| 検証 | 結果 |
|---|---|
| API build | PASS |
| Web build（Training含む） | PASS |
| Web一括回帰 | PASS（29スイート。既存PWA/モバイル/印刷/Feature Guard含む） |
| Phase 2主要API/認可回帰 | PASS、100境界assertions・136認証route metadata、Phase 1/導入/勤務条件/固定勤務/生成を再利用 |
| Phase 3/4匿名2園 | PASS、230 HTTP/data assertions、月次→不足/調整/再評価→FINAL→本人確認 |
| Phase 3/4ブラウザ | PASS、PC Chromium・390px Chromium・390px WebKitの導入と月次、A4/PDF |
| Phase 5契約 | PASS、17状態マトリクス、489 HTTP/data assertions、STANDARDA/PROFESSIONALBで月次回帰 |
| Phase 5ブラウザ | PASS、同3構成。表示/実API・停止/再開/解約/ダウングレード |
| 契約単体 | 25/25 PASS |
| Phase 6 API/E2E | PASS、Phase 3ハーネス込み183 HTTP/data assertions＋追加DB検証 |
| Phase 6ブラウザ | 同3構成PASS。未承認受付拒否→架空承認申込UI→受付、停止中問い合わせ送信→運営返信→再ログインで本人確認 |
| 既存規約同意 | PASS、本人/Tenant/版/hash/date/改変拒否の単体。既存HTTPハーネスも匿名fixtureで同時同意/重複/再同意/履歴/保護データを検証 |
| 新規申込同意 | PASS、明示同意なし/旧版/hash不一致拒否、未承認write0、証跡/本人確認後Tenantリンク、二重園作成拒否 |
| Tenant/本人/運営境界 | PASS、他園本文・返信、同じ園の別職員本文、園ADMINの運営受付アクセスを拒否。Membership失効も拒否 |
| サポート保存 | PASS、本文非監査複製、一覧PII最小化、状態と返信の履歴、空白/長さ/状態不正拒否、同時送信で日次上限維持 |
| Backup/restore | PASS、既存スクリプト・SHA256・private mode・新規隔離DB。契約/同意/問い合わせ/監査/メンバーシップ/月次の原本一致、復旧後ログイン・他園拒否 |
| 復旧の負例 | PASS、hash破損と既存DB上書きを拒否。既存backup safety/status testsもPASS |
| RCツール単体 | 10/10 PASS（既存Phase 1ローカルPython環境を使用。販売イメージ全RCを意味しない） |
| Web生成物source map | 0（distの.mapファイル確認。全コンテナ層RCはPhase 7） |
| 画面 | 横はみ出し・pageerror・外部リクエスト0。匿名画面を目視確認 |
| Git差分 | diff --check PASS、既存Migration差分0、Pilot working tree clean |

## 失敗からの修正・テスト変更根拠

1. 復旧テストでMembershipに存在しないidをsort指定して失敗。複合キーtenantId/userIdに修正。verifyContractの戻り値statusを正しく比較し、原本と復旧DBを検証。製品DBの変更で回避していない。
2. Playwrightでselectの暗黙labelを完全一致で指定しタイムアウト。実画面に表示されているラベルを使うlocatorへ修正。実際のクリック/送信/API/再ログインまで検証した。
3. AuthRateLimitMiddlewareの追加scope分離で、旧単体fixtureにoriginalUrlがなく例外。path/defaultの安全なfallbackを追加。既存hardening回帰を再実行してPASS。salesとauthのバケットを分け、公開申込でログイン試行枠を消費しない。
4. 旧Web静的チェックは「localStorage保存」「JSON書出し」を成功要件としていた。Phase 6の正式要求に合わせ、サーバー受付・返信・PII注意を検証する形へ更新。実HTTP・ブラウザE2Eを追加し、テストを無効化していない。
5. 旧規約HTTPスクリプトを単独実行した際にPROFILE_TEST_FIXTURE不足で起動できなかった。既存のスクリプトは変更せず、Phase 6匿名園とloopbackサーバーを渡すハーネスを追加してPASS。
6. システム/bundled PythonにはPyYAMLがなくRCツール単体を実行できなかった。既存 `/tmp/aen-phase1-rc-venv` を再利用して10件PASS。新規依存導入・課金なし。

## 再現コマンド

DBはlocalhost:55439の `aen_commercial_isolated`、TEST_DATABASE_ISOLATED=trueを必須とする。
接続秘密はログへ貼らず、既存ローカル設定を環境変数で渡す。

```
npm run build --prefix apps/api
# Web buildは既存AEN_RELEASE_METADATAの有効なlocal metadataを設定して実行
npm run build --prefix apps/web
npm run test:regression --prefix apps/web
npm run test:product-phase2 --prefix apps/api
PHASE3_BROWSER=true PHASE4_BROWSER=true npm run test:product-phase4 --prefix apps/api
PHASE5_BROWSER=true npm run test:product-phase5 --prefix apps/api
PHASE6_BROWSER=true PHASE6_RESTORE=true npm run test:product-phase6 --prefix apps/api
node --test apps/api/test/subscription-fail-closed.test.cjs
node apps/api/test/legal-existing-consent.test.cjs
sh ops/postgres-backup/test-safety.sh
python3 ops/postgres-backup/test-status.py
```

PLAYWRIGHT_MODULEは既存ローカルruntimeのmoduleを指定。ブラウザ・サーバーはloopback、外部リクエストは遮断。
復旧先は新規restore_verify DBのみ、終了後は試験で作成したDBを削除。匿名dump・hash・復旧レポートはprivate権限で `output/product-phase6/backup` に保存。
画面は `apps/api/output/product-phase6`。いずれもGit対象外。
最終正常ログはローカル `/tmp/aen-phase6-{api2,api4,api5,e2e,webtests,contractunit,consent-unit,rctools}.log`。

## 判定と範囲

Phase 6の隔離実装・回帰・文書整備完了。Phase 7候補RCへ進行可能。ただし実販売可ではない。
価格・法務・保持期間・販売契約移行・決済・本番保守Gateは `phase6-release-checklist.md` を参照。
新規有料サービス、GitHub Actions実行、外部メール送信、Production接続・デプロイは0。追加費用0円。
