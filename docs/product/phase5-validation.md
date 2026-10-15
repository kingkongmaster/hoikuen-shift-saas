# PRODUCT Phase 5 検証記録

2026-10-15。PRODUCT / codex/commercial-saas-release。
基点 d06d9eb14d4337012d480e67ef6b7e534ac6d6ee。

## 隔離・費用

ローカルPostgreSQL（loopback:55439、DB名aen_commercial_isolated）と既存インストール済みブラウザのみ。
全fixtureは匿名。Phase3のprovision・招待・登録をHTTPで再利用して2園を作成し、終了時に自身のfixtureだけ削除。
期限経過・欠落・破損値の再現に限り隔離DBのテスト行を変更。Productionへ接続しない。
外部決済・有料契約・クラウドrunner・deployなし。追加費用0円。

## 実行結果

| 検証 | 結果 |
|---|---|
| API build | PASS |
| Web build＋Training bundle | PASS（ローカル検証用release metadata） |
| 契約単体 | 25件PASS：未知Plan/status、期間・上限・Tenant異常、境界時刻、override異常 |
| Phase5契約E2E | 17状態／プランmatrix、489 HTTP/data assertions PASS（Phase3＋paid月次再利用含む） |
| PC Chromium／390px Chromium／390px WebKit | 3種PASS：実APIと利用可能機能一致、解約、運営更新・停止・再開、失効案内、downgrade案内 |
| Phase4 paid-plan月次 | STANDARD園A／PROFESSIONAL園B、希望休→生成→不足→再評価→調整→FINAL→本人確認PASS |
| 既存Phase3＋4 E2E | 230 HTTP/data assertions PASS、匿名2園、TRIALと明示Feature許可を維持 |
| 既存Phase3／4ブラウザ | 上記3種で導入全経路・月次・本人シフト・希望休・通知・A4印刷PASS |
| Phase2 API主要回帰 | PASS：契約HTTP、Feature、WorkPattern、勤務条件、属性、詳細人数、有給、導入、Tenant境界100assertions |
| 職員上限の既存並行テスト | PASS：同時作成1件だけ成功、ロック待機中停止後は拒否、Audit区分／理由を維持 |
| 認証経路メタデータ | 128 authenticated routes PASS |
| 生成関連単体 | 詳細必要人数13scenario、勤務条件30assertions、固定勤務・運用hardening等PASS |
| Web一括回帰 | 29スイートPASS |

ブラウザテストは外部リクエストを拒否し、横幅overflowとpageerrorを検証。
スクリーンショットはローカル `apps/api/output/product-phase5/`、Phase4のA4 PDF・画像は
`apps/api/output/product-phase4/`。WebKit390pxとPCの実画像も確認。
Windows実機、iPhone/Android実機、決済事業者、Production試験の完了は主張しない。

## 修正・失敗の経緯

1. 既存契約モデルは有料期間未設定とPAST_DUEの書込みを許可していた。共通policyで閉じる。
2. 停止中の初期Web試験で、ログイン後の `/me` まで拒否し契約案内に進めなかった。
   自身のセッション・契約メタデータのみ例外に限定し、実ログイン経路を3ブラウザで再試験PASS。
3. ダウングレードで高度条件が黙って生成対象から落ちる可能性があった。
   データ保持＋契約／条件HARD不整合で停止。Setup中にも契約表示と窓口案内を追加。
4. 旧テストの有料契約fixtureは終了日なし、TRIALは開始日なしだった。
   正常系は明示した有効期間へ更新し、不正期間・未設定の拒否ケースは追加して維持。
   停止／失効後の業務GETも403へ正式仕様変更。テスト削除・無効化なし。
5. Phase3系を並行実行した一度の失敗は、旧テストの固定招待tokenHash衝突。
   テストごとの乱数へ変更し、再実行PASS。認証制約は緩めていない。
6. API buildはPASS。最初のWeb buildは既存必須metadataを指定せず拒否された。
   ローカル検証用metadataを明示し、最終build PASS。release guardは維持。

## 再実行

隔離DBを明示したうえで（URLや秘密情報をログへ転記しない）：

- `npm run build --prefix apps/api`
- `AEN_RELEASE_METADATA=... npm run build --prefix apps/web`
- `npm run test:product-phase2 --prefix apps/api`
- `PHASE5_BROWSER=true PLAYWRIGHT_MODULE=... npm run test:product-phase5 --prefix apps/api`
- `PHASE3_BROWSER=true PHASE4_BROWSER=true PLAYWRIGHT_MODULE=... npm run test:product-phase4 --prefix apps/api`
- `npm run test:regression --prefix apps/web`

DBテストは `TEST_DATABASE_ISOLATED=true` とローカル隔離 `DATABASE_URL` が必要。
Playwrightは既存runtimeを参照しダウンロード・サービス追加は不要。

## 保護対象・残Gate

Pilot HEADは531dde7c504577f9277ae603a2a61bdb83f79a64、working tree cleanを確認。
PRODUCT schema／既存Migration／generator本体／deploy／workflowの変更なし。
変更差分の匿名データ・secret review、`git diff --check`を実施。
GitHubは既存public repository、open PRなし。workflowはPRまたはmanualのみでpush起動なし。
force push・PR作成・Actions起動は行わない。

Phase5の機能BLOCKERなし。Phase6へ進めるが、ここで停止する。
法務・保持期間・価格・請求・決済adapter・販売サイト所在／統合・最新Security RC・実機総合試験は後続。
旧期間未設定の環境へ無検証で反映すると利用拒否となるため、将来公開前には契約適合確認が必要。
本記録は販売公開承認／Production READYではない。
