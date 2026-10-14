# Phase 1: 42件／4件の採用判断

監査基点PRODUCT `26fbb2eeadc569a504c2f3d5bfc4a40e2a88d17e`、main `1f06c683ed8be5f8d4ed8cf0b1d5523f5b70c919`。

カテゴリ3は標準仕様/標準導入への不採用であり、既存Git履歴やCustom工具の削除を意味しない。混在commitは部分採用で、園条件の無条件な共通化をしない。カテゴリ5は販売前判断として残す。Phase1の境界確定は進められる。

## PRODUCT 42件

| SHA | 分類 | 採用範囲・根拠 |
|---|---|---|
| f83075b | 5 | Windows配布器は保留。標準入口はWeb/PWA。署名・更新・配布保守の採用判断が必要。 |
| eee6e14 | 1 | 月次・行事・休園・有給・復旧の共通基盤を採用。混在するtenant-packages/musubi、園別fixture・deployはCustom/保守専用に除外。既存Migrationは維持。 |
| b0c432e | 1 | Production操作防御、復旧・secret防御を採用。園別取込/配備手順は標準導入に流用しない。 |
| 8f78fa9 | 1 | 候補判定、勤務適用、ロール・DB権限防御を採用。Pilot channel制御はそのままPRODUCT仕様にしない。 |
| f3300dc | 1 | image hardening、metadata、検証を採用。既存Security承認はPRODUCTの新SHAへ自動継承しない。 |
| f04319f | 1 | 固定時間判定・同週再配置・validationは共通採用。園別formal入力契約・取込・条件はCustom境界。 |
| 7a6cea4 | 1 | 共通テスト表記整合を維持。 |
| 1935632 | 1 | API image source map除去を採用。 |
| 89c5b2c | 1 | image stageの固定を採用。 |
| 9c17ea7 | 3 | 園別formal preflight/zero-staff取込工程は標準導入から除外。汎用の原子的導入は26fbb2eを再利用。履歴/既存ツールは削除しない。 |
| cbcd9a9 | 1 | 管理者と職員の遅延紐付けを採用。園別IDを標準値にしない。 |
| 488c561 | 3 | 園別formal import実行器。出典付き取込の考え方だけ汎用取込設計で再利用。標準Setupから実行しない。 |
| 52c7934 | 1 | 初回認証・Setup入力検証を採用。 |
| a16008e | 1 | PWA、更新、アイコン、初回認証UIを採用。園固有プロフィール値は持ち込まない。 |
| 3a89533 | 1 | 安全なcredential recoveryを運営専用能力として採用。園ADMINへ公開しない。 |
| b09b161 | 1 | プロフィール構造を保つSetup修正を採用。 |
| 5ec3419 | 4 | 前コミットの空白修正。独立機能として再実装/再取り込み不要。 |
| 8a11e45 | 1 | 投入済み設定の保護を採用。新規園Setupの省略条件にはしない。 |
| 7dd2265 | 5 | 無料Pilotの規約本文は販売契約へ流用しない。同意UI/証跡機構のみ採用。販売文書は人間/専門家確認。 |
| bf1bed3 | 1 | 登録内容reviewの枠組みを採用。園固有出典と値はCustom。 |
| 1239758 | 1 | 読みやすいreview UIを再利用。固定のパターン順は将来Tenant設定へ。 |
| 49aec74 | 1 | 候補抽出とreview基盤を採用。特定出典IDによるルールはCustom境界に維持。 |
| 7ee9c5f | 3 | 園別review日範囲fixtureの修正。PRODUCT受入の根拠にはせず匿名一般園fixtureを別途使用。 |
| 5b16684 | 1 | 子育て支援を含む固定勤務review構造を再利用。園固有人数/時刻は標準化しない。 |
| 737475b | 1 | 土曜と職員reviewの説明構造を採用。特定の土曜体制はTenant。 |
| 882e446 | 1 | 同意version/hash/本人証跡による再利用を採用。販売版同意文書の承認とは別。 |
| c29ba5b | 1 | Setup後READ ONLY確認導線を採用。 |
| 16259a8 | 1 | 月次入力mapping validationを再利用。実データを取り込まない。 |
| 1b1c450 | 1 | 管理者回答・再評価の機構を採用。個別回答/出典の実例は持ち込まない。 |
| 9bf77e0 | 1 | 隔離DB検証方式を採用。一般園匿名fixtureで再検証する。 |
| a780057 | 1 | 未確定入力と回答対応の保護を採用。 |
| 1077e0e | 1 | 費用Gate付きmanual RCを採用。main735ddb5と同一patch。 |
| 3262dd1 | 1 | RC到達性検証を採用。main8817137とコード/試験/手順が同一、こちらはpolicy資料を追加。 |
| 8274498 | 1 | 秘密を含まないRC診断を採用。maina906f25と同一patch。 |
| 6050ae5 | 1 | container内process検証を採用。main1f06c68と同一patch。 |
| 5dae4a0 | 1 | 未提出と0件の区別・FINAL前確認を採用。 |
| 71e6e16 | 1 | 重複診断時の安全な同週修正を採用。園別再現fixtureはCustom回帰に限定。 |
| be66f98 | 1 | 固定土曜勤務とローテーション適格性の区別を採用。具体条件はTenant。 |
| c4f9c99 | 1 | 隔離Training/Helpを再利用。コース例は一般仕様そのものではなく匿名例。販売版との内容照合は後続Gate。 |
| 531dde7 | 1 | 数値proxy trust検証を採用。CVE判定資料は履歴であり新RCの承認ではない。 |
| be9fcf4 | 1 | 3scopeと共通表記/保護規則を採用。 |
| 26fbb2e | 1 | 独立園管理者の原子的作成と匿名試験を再利用。運営UI等は未完。 |

## main 4件

| SHA | 分類 | PRODUCT側 | 根拠 |
|---|---|---|---|
| 735ddb5 | 4 | 1077e0e | 既にPRODUCTへ同等変更あり。重複cherry-pick不要。patch-id一致。 |
| 8817137 | 4 | 3262dd1 | 既にPRODUCTへ同等変更あり。重複cherry-pick不要。PRODUCT側にpolicy資料が追加。 |
| a906f25 | 4 | 8274498 | 既にPRODUCTへ同等変更あり。重複cherry-pick不要。patch-id一致。 |
| 1f06c68 | 4 | 6050ae5 | 既にPRODUCTへ同等変更あり。重複cherry-pick不要。patch-id一致。 |

分類1=採用、2=mainから追加、3=Custom専用、4=重複不要、5=判断待ち。
mainの新規取り込みは0件。mergeで古いRCへ戻さず、現在の数値proxy検証も維持する。
詳細ファイル一覧・完全SHA・比較結果はphase1-commit-decisions.json。
