# PRODUCT Phase 4: 一般園の月次運用

2026-10-15 / PRODUCT / 基点 `743b1673786169380cd18598fa695e34c43382da`

## 対象と境界

PRODUCT workspace、`codex/commercial-saas-release`、loopbackの隔離PostgreSQLのみ。
本番接続・デプロイ・課金・Pilot変更・実データ使用なし。既存Migration、schema、generator本体は変更しない。
Phase 3のprovision→一回限りの招待→園ADMINログイン→設定APIをそのまま再利用した。
DBによる初期投入は匿名PRODUCT運営者だけ。顧客園、管理者、職員、勤務条件、月次シフトはAPIで作成。
契約異常の負例は隔離DB内でのみ作り、復元している。

| 園 | 構成 | 対象月／明細 |
|---|---|---|
| 匿名園A | 職員2名、標準勤務、希望休、個別休園日 | 2032-02／58件 |
| 匿名園B | 職員5名、2部署、標準＋独自日勤、固定勤務、勤務不可、有給1日・午後半休 | 2032-02／145件 |

TRIAL有効、Setup HARD完了を確認。園Bの高度勤務機能は運営者の既存Feature設定APIで明示的に有効化。
TENANT_CUSTOM_RULESや顧客専用manifestは使わない。未完了Setupは作成拒否。
契約期限不明・期限切れ・未来開始・停止は、作成／生成を403で拒否する。

## 実証した月次経路

1. 職員ログインを園ADMINが発行。本人が初期パスワード変更後ログイン。
2. 本人希望休→管理者承認、休園日、園Bの有給／半休・固定勤務・勤務不可を設定。
3. 標準生成：希望休・休園日・勤務不可は非勤務、固定日勤と半休modifierを実データで検証。
4. 未提出のままFINALは409。0件を含め4カテゴリを管理者が明示確認。
5. 人数を意図的に過大設定し、不足を隠さず提示。
   - ERROR: SATURDAY_MINIMUM_SHORTAGE。FINAL拒否、日付・人数・影響を提示。
   - WARNING: CLASS_SHORTAGE、REQUEST_CONSTRAINT_UNRESOLVED。配置の判断が必要。
   - INFO: 休園日／日曜／土曜非営業、フリー職員による補完。
6. 管理者が必要人数設定を訂正→再生成→再評価。通常勤務／休み／担当クラスを手動変更。
7. 承認済み休暇・休園日・HARD勤務不可への勤務保存は409。別園職員は404。
   有効な変更と不正変更を同時送信してもバッチ全体でwriteなし。
8. FINAL後は確定者・日時を保存。直接編集409、一般職員編集403。
9. 職員は確定前の明細を取得できず、確定後は本人の明細・通知・希望情報のみ。
10. 有給取得は生成済み基礎勤務を参照して1日／半日を確定。半休は印刷と本人カレンダーでも区別。
11. 別園のシフト取得／FINAL／希望休取得・変更／職員変更を拒否。対象園のシフト全体の前後一致を比較。

不足対応は通常の設定訂正→再生成経路を使用した。回答カードの状態遷移は既存の
`manager-resolution.test.cjs`（9件）と`manager-resolution.integration.cjs`（7件）を再利用し、
ADMIN回答→監査→再評価、古い回答拒否、未解決／古い評価でFINAL拒否を検証した。
一般園テストへ専用取込で回答カードを捏造してはいない。

## 修正と根拠

- **手動保存のHARD防御**: 休園日勤務が200で保存される再現を追加した後、既存FINAL検証器を
  保存前の候補明細にも適用。既存の無関係なエラーの段階的修正は可能とし、変更セルのHARD違反、
  新しい違反、システム安全性違反を拒否する。週境界の候補にも変更を反映。
- **旧パターン参照**: 手動で勤務種別を変えても生成時のworkPatternが残り、表示／評価が食い違うため、
  手動保存で旧参照を解除する。OFF変更後の表示データとFINALまで検証。
- **A4既定**: 管理者印刷がB4既定だったためA4横へ変更。A3／B4の任意選択は削除しない。
- **半休表示**: 基礎勤務＋半休modifierが本人カレンダー／印刷で通常勤務に見えていた。
  既存modifierを必要最小限で返し、本人には半休と有給時間、印刷には半休と勤務側の時間を表示。
  基礎勤務・生成・有給残高計算は変更しない。
- **旧テストのmock不足**: 管理者回答の統合テストは月次提出テーブルのmockがなくTypeErrorだった。
  実際のdigestを持つ4カテゴリ提出済みfixtureを追加し、既存のFINAL／回答検証は全て維持。
- **比較の安定化**: Tenant snapshotは明細をid順に比較。DB未指定順序を差分と誤認しない。

SHARED影響: 上記は共通仕様に関わるが、適用先はPRODUCTだけ。
Pilotは既存SHAのまま。将来の取込時には手動編集の新しい拒否条件・A4既定・半休表示を再検証する。

## 検証

以下は最終変更でPASS。月次＋オンボーディングHTTP／データ確認234件、月次ブラウザ3環境。

- API build、Web build（Training build含む）。
- `test:product-phase2`: Fail Closed単体15、HTTP、Feature Guard、主要設定API、Tenant境界、権限、
  有給、生成器既存単体、固定勤務等の回帰。
- Web `test:regression`: 29系統。
- Phase 3オンボーディング: 匿名2園＋PC Chromium／390px Chromium／390px WebKitで運営者→招待→Setup完了。
- Phase 4: 同じ2園から月次E2E、PC Chromium／390px Chromium／390px WebKitで
  管理者の下書き再開→チェック→再生成→FINAL、印刷、本人のカレンダー／半休詳細、希望休申請、通知。
  ブラウザ外部通信0、pageerror0、document横はみ出し0。
- 本人カレンダー認可単体、管理者回答9＋統合7、半休時間計算、生成前チェック／週境界検証。
- 印刷HTMLを3環境で確認。Chromiumは実PDFを保存し、A4横（約842×595pt）、1ページを確認。
  WebKitは印刷HTML・print CSSまで。実機iPhone／Android、OS印刷ダイアログ自体の検証ではない。
- 最終ログとスクリーンショット／PDF: Git対象外の `output/product-phase4/`。

再実行例（リポジトリルート、DATABASE_URLは既存ローカル隔離DBを明示）:

```sh
TEST_DATABASE_ISOLATED=true npm run test:product-phase4 --prefix apps/api
```

`PHASE4_BROWSER=true` と既存 `PLAYWRIGHT_MODULE` で実ブラウザも実行。
`PHASE3_BROWSER=true` を併用するとオンボーディング画面も再実行する。
本番URLへ切り替えて実行しない。

## 残課題と次工程

Phase 4のBLOCKERなし。Phase 5へ進行可能（今回開始しない）。
Phase 5は契約／プラン運用の整備。今回の2園は有効TRIALと明示的Feature設定を使用し、
すべての販売プラン組合せの総合検証や本番決済を完了したという意味ではない。
一般園向けの高度な確認カード作成UI、全enum一般化、実機総合検証、最新Security RC、
販売規約本文、Windows配布器は従来の後続項目。今回の月次標準経路のBLOCKERではない。
新規有料サービス・追加リソース・Actions手動実行なし、追加費用0円。
