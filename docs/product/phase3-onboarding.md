# PRODUCT Phase 3 — 新規園オンボーディング

追記：旧Web一括回帰の不整合は[Phase3最終ゲート](phase3-final-gate.md)で解消・全29スクリプトPASS。以下の未PASS／未push記述は初回完了時点の履歴です。

2026-10-15。開始基点 `a60c6554e4176e63606414fcf61fb10cf41498ad`。
PRODUCT workspace / `codex/commercial-saas-release` のみ。匿名ローカル隔離DBを使用。
Production接続、Pilot branch編集、実職員・個別園条件の持込、決済・デプロイは行わない。

## 標準経路と再利用

申込内容を運営窓口が確認 → 運営者が `/#operator` にログイン → 園・独立ADMIN・30日TRIAL・招待を一つのtransactionで作成 → 本人確認済みの非公開経路で招待を渡す → 園管理者が `/#register` で招待情報とログインIDを入力してパスワード設定 → 通常ログイン → 初期設定 → シフト作成準備完了。

販売サイトと申込画面は既存の公開前プレビュー（送信・保存なし）を維持する。
このPhaseは運営窓口で確認した申込を標準Web/APIで処理する方式。自動申込受付・メール配信・決済の完成を意味しない。
顧客Tenantや勤務条件の複製、顧客園導入ごとの直接SQL操作は不要。
運営者の初回bootstrapは既存の承認済み運営者作成手順を使用し、園ADMINとは別権限。

| 機能 | 再利用／追加 |
|---|---|
| 園・独立ADMIN・契約作成 | 既存 `POST /tenants/provision` を再利用。無効ADMINと招待を作成する方式へ更新 |
| 契約と園メタデータ | 既存 `/platform/tenants`。作成日・園ID・契約・試用期限・利用停止を確認。職員情報は取得しない |
| 初回登録 | 既存User/Membership、PasswordService、JWT認証を再利用。`POST /auth/accept-invitation` 追加 |
| 招待一覧・再発行 | `/tenants/:tenantId/invitations`、`POST /tenants/:tenantId/invitations/:id/reissue`。生きた運営者権限を再確認 |
| 園基本情報 | 既存 `/setup/tenant` |
| 職員・雇用・個別勤務条件 | 既存 StaffManagement / StaffFormModal / 勤務条件・契約画面 |
| 部署・所属 | Phase2のAPIを再利用し、作成・所属登録UIを追加 |
| クラス・必要人数・勤務条件・休園日・生成条件 | 既存 ShiftSettings |
| 勤務パターン・希望休・有給 | 既存 WorkPatternManagement / RequestManagement / PaidLeaveManagement |
| 準備状態 | `GET /setup/readiness` と CommercialSetup を追加。既存データから導出 |

## 招待と認可

- URLだけでは登録できない。32byte乱数の秘密招待情報、UUID、正しいTenant、対象ログインID、未使用・期限内の状態が必要。
- 48時間・一回限り。DBにはSHA256のみ。受取Userの紐付けとADMIN membershipを確認。受取Userが運営者・有効化済みなら拒否。
- 招待利用とUser有効化・tokenVersion更新は同一transaction。競合利用は一方だけ成功。
- 再発行もtransaction。旧招待をREVOKEDにして新しい秘密情報を発行。登録済みは再発行しない。
- 平文招待は権限確認済みの作成／再発行レスポンスに一度だけ返す。URL、localStorage、sessionStorage、監査ログには保存しない。HTTPログは本文を記録しない。
- 公開登録APIは既存の認証試行回数制限の対象。JWTが不要な例外はこの招待検証APIだけ追加。
- 本人確認は運営者が既存の非公開連絡経路で行う。自動メール到達確認や公的本人確認ではない。招待情報を受け取れる相手の確認は運営手順の責任。
- パスワードは本人が設定。旧DTOの任意 `initialPassword` は互換入力として検証するだけでログイン資格情報として採用しない。新UIは送信しない。
- Tenant IDをrequest body/queryで差し替えても園ADMINの所属は変わらない。運営者に顧客のStaff閲覧権限を追加しない。
- `COMMERCIAL_ONBOARDING_ENABLED=true` の明示設定がなければ作成・受付・再発行は拒否する。デプロイや本番設定変更はしていない。

## Setup判定

園作成のサーバー側 `TENANT_PROVISIONED` 監査記録があるTenantに適用する。監査記録を任意削除する運用は前提としない。今後の監査保存期間変更時にはこの判定への影響を再設計する。
既存Pilot等の非対象TenantのSetupWizard・同意判定は維持。

| 区分 | 項目 | 判定 |
|---|---|---|
| HARD | 契約・試用期間 | 既存Fail Closedと同じ実効シフト生成権限 |
| HARD | 園基本情報 | 園名と連絡先メールを保存 |
| HARD | クラス・必要人数 | 有効クラスがあり、必要人数の明示保存履歴あり |
| HARD | 職員 | 有効職員が1名以上 |
| HARD | 雇用・勤務条件／生成条件 | 園共通設定と明示保存履歴。職員個別値は登録画面で指定 |
| HARD | 勤務パターン | 有効な勤務パターンが1件以上。標準4種を再利用可能 |
| WARNING | 部署・所属 | 有効部署の登録を推奨。所属UIあり（全員の所属を強制しない） |
| WARNING | 個別休園日 | 休園日登録を推奨。土日開園方針は勤務設定で確認 |
| OPTIONAL | 固定勤務 | 必要な園のみ。契約上の権限がある場合に既存画面から設定 |
| OPTIONAL | 希望休 | 月次で入力。未提出／0件等の高度な運用確認はPhase4 |
| OPTIONAL | 有給 | 必要な場合に付与・初期残高を登録 |

画面は「必須／推奨／任意」「未設定／設定途中／設定済み」で表示する。
設定保存後の再確認・再読込でDBから再計算し、端末だけの完了フラグに依存しない。
初期値のGETだけではクラス・勤務条件の確認済みにしない。
全HARDが揃うまで画面の進む操作とAPIのシフト作成・生成を拒否する。
準備完了は、特定月の人数充足、法定条件、FINAL可能性の保証ではない。月次の生成前チェックを別途使う。

**業務準備状態と販売法務の完了状態は別。** `setupStatus=COMPLETED`、既存同意、法務承認を自動設定しない。
このPhaseの匿名導入は販売規約の確定を妨げにせず業務経路を検証するためのもの。
正式販売・本番導入前に販売規約の承認と同意取得Gateを接続し直す必要がある。販売公開可能という判定ではない。

## TRIAL・プラン

新規園は明示した開始時刻から30日間のTRIAL、職員上限20名。開始・終了を運営画面と初期設定画面に表示。
契約不明・未知値・不正期間・期限切れでは有料機能を開放しない。
標準4パターンを使用可能。高度な勤務パターン／固定勤務等は既存Feature Guardに従う。
匿名園Bの追加パターン検証では、運営者がAPIで明示的なFeature overrideを付けた。
新規TRIALの全機能自動開放を導入したわけではない。本番課金接続なし。

## Migration・既存系統への影響

`202610150001_product_admin_invitation` は `Invitation.invitedUserId` nullable列とUserへのFKだけ追加。
既存Migration30件を変更しない。既存行のbackfillや既存User有効化はしない。
受取Userを持たない旧招待は新しい公開登録APIでは拒否する。
月次生成器・園固有Customコード・enum一般化・正式勤務条件は変更しない。
共通ログインに初回登録リンクを追加し、Trainingは同じUIを継続利用。通信遮断は維持。
勤務設定内の園固有例文を一般的な年度設定説明へ変更。

## 残課題・次工程

Phase4は一般園の対象月→希望休等の確認→DRAFT→不足解消→FINAL→印刷／職員閲覧を検証する。
今回の準備判定を、月次完成可能判定と取り違えない。
任意クラス・雇用区分の完全一般化、希望休ルールの高度な設定、運営権限細分化、自動メール、販売規約、本番決済、Windows専用配布、最新Security RCは未完成／対象外。
旧Web一括静的テストにはPhase2基点にも存在する不整合あり。詳細は検証記録。今回のPhase3 E2Eと区別し、全製品回帰PASSとはしない。
