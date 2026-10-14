# PRODUCT Phase 1: 統合基準・仕様境界

Scope PRODUCT。承認範囲はPhase1。監査基点・全46コミットの判断は
[分類表](phase1-commit-decisions.md)とJSONを正とする。

## 採用する構成

単一repositoryのBASE + Tenant設定 + Custom extensionを採用する。
現PRODUCT 26fbb2eを作業基点として維持。main側4件のRC変更は同等実装がすでに
PRODUCTに存在するためcherry-pickしない。mainの更新・merge・Pilotへのbackportは今回なし。
過去の42対4という比較を将来HEADで再計算して件数が変わっても、この監査表は固定SHAの記録として残す。

「採用」は責務/再利用先の決定であって販売品質の保証ではない。混在commitは
共通の仕組みを採用し、園別データ、配備値、条件、出典、無料Pilot文言は共通仕様にしない。
Custom専用資産は現Git履歴に残すが、PRODUCT標準Setup/Demoへコピー・実行しない。
実行artifactからの不要Custom資産除去と販売チャネル検証はRC前Gate。

## BASE / Tenant / Custom

| 責務 | BASE | Tenant設定 | Custom extension |
|---|---|---|---|
| 認証 | token失効、初回変更、所属照合 | 管理者/職員所属 | 園固有認証の無条件追加なし |
| 勤務生成 | HARD検証、不足説明、回答、再評価、DRAFT/FINAL | 時刻、人数、曜日、固定/除外、希望、行事、休園 | 明示許可された追加ルールのみ |
| 配置 | パターン/属性/必要人数の共通モデル | 名称、表示順、職種、部署、クラス | 特定Sourceの解釈/正式入力adapter |
| 有給 | 付与と確定消化、取消/訂正履歴 | 初期残高、付与実績 | 固有値の一般default化なし |
| 導入 | 独立管理者、原子的園作成、確認画面 | 園の入力・確認済み値 | 園別一括取込toolを標準導入にしない |
| UI/Training | 実UI、匿名練習、write防御、A4 | 園名や設定表示 | 園専用review値/例は一般コース仕様にしない |
| 契約 | 契約確認、Feature Guard、監査 | 明示的契約・期限・上限・override | 個別契約許可は契約確認後のみ |

Customは契約・Tenant・source provenance境界を超えない。Customを有効にしても
HARD、安全確認、認可を黙って迂回しない。各園の業務設定と販売planは別の軸。
販売UIから不要な技術JSON・backup操作・園専用Demoを除外する後続Gateを残す。

## 契約Fail Closed（今回実装）

- 契約行なし、未知plan/status、TRIAL期限なし/無効は403 SUBSCRIPTION_UNVERIFIED。
- DB照会失敗はそのまま失敗し、有効な契約を捏造しない。
- 個別Feature override照会より契約確認を優先。Missing契約から有料機能を開放しない。
- 期限ちょうどを含むTRIAL失効、停止/解約/失効状態は書込み不可。
- ACTIVEと既存PAST_DUEの猶予扱いは維持。猶予期間の販売仕様は後続契約設計で決める。
- 契約確認不可では契約画面も既存ErrorStateを表示する。架空STANDARDを表示しない。
- 勤務パターン一覧は契約判定後だけ初期作成する。既知の利用停止/期限切れでは
  初期データを作らず既存の標準パターン閲覧を維持。
- 職員作成transaction内でもTRIAL期限欠落を許容しない。
- すべてのGETを完全に無書込みへ変更したわけではない。Settingsのlazy initialization、
  契約画面の期限通知作成等は既存仕様として別途監査対象。

影響する呼出先: FeaturesService.resolve/list/Guard、SubscriptionsService.get/assertWritable/
assertStaffCapacity、SubscriptionWriteGuard、StaffService作成・更新、PaidLeave/勤務契約の書込み等。
移行前の契約欠落Tenantは拒否されるため、将来の配備前にread-only棚卸しと正当な契約情報の
確認が必要。欠落を一括STANDARD補完しない。今回Pilot branch/runtime/DBは変更せず影響0。
これはPRODUCTでの採用であり、Pilotに未検証の修正を自動backportしない。

## 権限・Tenant境界

既存MembershipRole ADMIN/DIRECTOR/CHIEF/STAFFは維持。ADMINは園管理者であり運営者ではない。
APIごとの既存Roles指定を維持し、CHIEFを一括で管理者へ昇格しない。
運営専用権限は必要だが、新しいrole enum追加ではなく既存User.isPlatformAdminを再利用する。
園作成・契約更新・Feature override等の運営APIだけでDBから確認する。一般JWTの自己申告値では許可しない。
運営者であっても通常の業務APIのtenantIdは所属由来。運営権限を全業務の横断アクセスへ拡張しない。
専用運営UI・権限分割・MFA・復旧承認の詳細はPhase2以降の設計対象。

## 固定enum・Migration

クラスは年齢別+FREE/SUPPORT、雇用はFULL_TIME/PART_TIME/REEMPLOYEDの既存enum。
現在のAPI/DB/生成/表示を壊さないためPhase1で変更しない。
次案はTenant class masterと既存年齢区分の対応、および雇用の分類と表示名の分離。
新モデル・前方Migration・二重読取り期間・既存fixture互換を設計してから実装する。
重大なDB変更は実施前に人間確認。過去Migrationの書換え・Production適用はしない。
今回schema差分0、Migration差分0。既存複合FKのTenant境界を保持する。

## 既存成果物の再利用

- 月次、回答、再評価、印刷、Training、PWAは既存React/APIを再利用。
- 新規園APIは26fbb2eを基点とし、同じprovisioningを作り直さない。
- 既存販売サイト/申込preview/commerce設計はローカル既存成果物を参照。
  共通ページだけを移植候補とし、園専用ページ・QR先・古いB4表記は標準へ持ち込まない。
- commerceのlive adapterは未実装。料金・有料サービスの採用をPhase1で決めない。
- 無料Pilot規約本文とWindows専用配布器は判断待ち。PWAと同意証跡機構は採用。

## Phase1の完了条件と残るGate

46件の分類・根拠確定、main差分の重複判定、責務境界、Fail Closed修正、関連匿名回帰PASSでPhase1完了。
Phase2へは進められる。販売READYではない。
残り: enum一般化設計、運営UI、一般園Setup/月次E2E、商品権限表、販売法務/申込み/課金、
診断/サポート/復旧、端末検証、最新Security RC。既存Security policyのfingerprintは
PRODUCTと一致しないため、今回書き換えてPASS扱いにせず新RCでレビューする。
