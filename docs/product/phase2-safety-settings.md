# PRODUCT Phase 2 — 安全性と設定モデル

Scope PRODUCT。基点 `9d99350b6c32ab79ebf2abd94385d1e47b6d4327`。
実装対象は既存PRODUCT worktreeのみ。Pilot、本番、実データ、既存Migration、決済は対象外。

## Tenant境界監査

APIは署名JWTからtenantIdを取得し、TenantAccessGuardで現在のMembershipの
有効状態・role・tokenVersionをDB照合する。JwtAuthGuardはUser有効状態・tokenVersionを確認する。
入力body/queryのtenantIdを権限根拠にしない。園ADMINにも他園の業務アクセスは許可しない。
DB複合FKとAPI認可は別々に検証する。単純な「DB制約があるから安全」という判定はしない。

| 対象 | API側の境界 | 検証 |
|---|---|---|
| Staff・ログインアカウント | get/list/変更前取得はtenantId、ADMIN書込、本人APIはtenantId+userId | HTTP他園GET/PATCH/DELETE拒否、STAFF拒否、旧role token拒否 |
| Shift / MonthlyShift | tenantId+id、職員は本人/確定のみ、管理操作はRoles | 他園GET/generate/confirm拒否、一覧・既存生成回帰 |
| ShiftAssignment | 所属月の編集可否と入力staffId集合を同Tenantで照合 | 他園月へのPUT、自己月への他園職員投入拒否、既存生成/手動/backup回帰 |
| ShiftRequest | tenantId+id、一般職員は紐付く本人staffId、他園staff指定拒否 | GET/PATCH/DELETE/POST、一覧staffId指定の拒否 |
| WorkPattern | tenantId+id、Feature契約判定、標準パターン保護 | 他園PUT/DELETE拒否、既存CRUD/プランE2E |
| StaffWorkRule | tenantId+staffId+ruleId、参照patternも同Tenant | 他園職員・ruleId・patternId拒否、既存E2E |
| Department / StaffDepartmentAssignment | tenantId+id、職員と部署を両方照合、DB複合FK | 新API他園更新・参照・割当拒否、重複拒否、匿名DB FK |
| 有給 | staff所属、grant/usage/allocationと関連申請/割当の所属確認 | HTTP他園付与/閲覧/取消拒否、既存全日半日/訂正/同時実行E2E |
| 通知 | tenantId+memberId、既読変更も両条件 | 他園・同園他受信者への既読拒否、所属停止で拒否 |
| 設定 / Setup | user.tenantIdのみ使用、Rolesと書込契約確認 | 偽装tenantIdで他園不変、STAFF拒否 |
| 契約 / Plan / Feature | 自園取得。運営APIのみDB上isPlatformAdmin照合 | 園ADMINの運営API403、運営者の他園Staff404、プラン別HTTP |
| 職員属性 / 必要人数 | 定義・割当・職員・patternのtenantIdとFeature | 既存属性/必要人数E2Eと複合FK回帰 |
| 勤務契約 / 年間集計 | 所属職員の確認、tenantIdで集計、ADMIN/DIRECTOR | ソース監査（今回新規HTTPは主要上記対象） |
| 行事 / 日別例外 / 休園 | tenantIdで取得・変更前照合、例外コード参照も園内 | ソース監査、既存生成回帰 |
| 印刷 / CSV / backup / 交換 / 個人勤務 | 所属園・本人条件、backup入力tenant一致、交換相手membership確認 | ソース監査、既存勤務パターン/有給E2Eのbackup確認 |

追加のNest metadata試験で122の認証対象routeを走査。認証/所属guardの存在を確認。
公開health/login/logoutは別扱い。旧POST /tenantsは常時403で、新規園導入を案内。
これは有限の監査・回帰検証であり、将来の全API変更や未実行の全分岐の安全性を保証するものではない。

## 運営者と園ADMIN

| 操作 | 園ADMIN | PRODUCT運営者 |
|---|---|---|
| 園の業務情報・職員・設定 | 自分の所属園のみ | isPlatformAdminだけでは他園を閲覧不可 |
| Tenant作成 | 不可 | 既存provision API、opt-in、独立した園ADMIN作成 |
| 契約/プラン/利用停止・再開 | 自園の確認のみ | 既存platform API、契約検証と監査記録 |
| Feature override | 不可 | 理由/設定元等を既存APIで管理、契約拒否を迂回不可 |
| 一覧・サポート初動 | 自園のみ | 園ID/code/name/Setup状態/契約/集計人数に限定 |
| 職員個人情報・希望休・有給の横断閲覧 | 不可 | 汎用の横断業務APIは作らない |
| 障害・復旧・詳細監査 | 自園で許可された範囲 | 技術情報から調査。個別データアクセスは承認対象の別手順 |

旧POST /tenantsは運営者本人を顧客園ADMINにする経路だったため廃止（403）。
POST /tenants/provisionの原子的な園・契約・独立管理者作成を再利用する。
platform一覧のTenant全列返却をやめ、連絡先/住所等を除いた明示selectへ変更。
運営者権限をJWTの自己申告で許可しない。既存isPlatformAdminを再利用しrole enumは増やさない。
サポート担当等への細分化、承認付き一時アクセス、MFA、運営専用UIは後続設計。
既存運営アカウントの権限棚卸しや本番membership変更は今回していない。

## 固定enum・固定値の分類

A=PRODUCT共通固定、B=Tenant設定、C=Custom extension、D=現状維持。

| 値/モデル | 分類 | 判断・影響 |
|---|---|---|
| MembershipRole / SubscriptionPlan / SubscriptionStatus / SetupStatus | A | 認可・契約・状態機械。園が自由編集しない |
| ShiftRequestType/Status、MonthlyShiftStatus、ShiftSwapStatus | A | 承認と確定の状態機械。日本語表示と保存値を区別 |
| AttendanceModifierType、PaidLeaveGrantSource/UsageUnit/UsageStatus | A | 全日/半日・証跡・状態の共通意味を維持 |
| NotificationType / InvitationStatus | A | 通知・招待の処理種別 |
| StaffWorkRuleType / StaffAttributeCategory / StaffingConstraintLevel | A | ルールの演算とHARD/SOFT/INFOの安全意味 |
| AssignedClass（AGE_0〜5/FREE/SUPPORT） | D | 年齢区分として維持。任意名・同年齢複数クラスmasterは前方Migration設計が必要 |
| EmploymentType（FULL_TIME/PART_TIME/REEMPLOYED） | D | 生成・上限・表示・DTOに影響。表示名だけを保存enumに直結しない |
| ShiftType（EARLY/NORMAL/LATE等） | D | 旧互換分類は維持。可変の勤務区分は既存WorkPatternを利用 |
| Department名称・順序・有効状態・所属期間 | B | 既存DBを利用し今回API整備。履歴は削除せず無効化 |
| WorkPatternコード・名称・時間・勤務扱い | B | 既存モデル/CRUDを再利用。標準コードは保護 |
| 役職/資格/担当/スキルの定義と期間 | B | StaffAttributeDefinition/Assignment。Feature条件を維持 |
| 職員jobTitle/労働時間/固定勤務/曜日/必要人数 | B | 既存Staff/Contract/Rule/Requirementの設定値 |
| 年度開始月、連勤上限、運営曜日、休園・行事 | B | 既存設定/カレンダーAPI。自園スコープ |
| 園別取込、特定出典ID、独自HARD条件、①〜⑨の具体意味 | C | 一般園の標準値にしない。明示契約・検証・source境界 |
| 初期人数3/2等・初期時刻・土曜運営既定 | D | 旧互換defaultであり推奨/法定/一般園確定値ではない。Phase3で園が明示確認する導入へ |
| 希望休の過去日拒否/JST日付判定、1日/半日の記帳 | D | 現行日本国内向け。任意タイムゾーン・時間休対応を約束しない |

クラスを部署として偽装したり、雇用区分を無関係な自由文字で生成器に渡したりしない。
任意クラス/雇用区分の完全一般化は未完。DB・API・Web・生成・印刷・backupを含む
前方Migration/互換期間の設計が必要で、重大DB変更前に人間確認する。既存Migration書換え0。

## Tenant設定モデルとPhase 3への引継ぎ

| 設定 | 現在の保存先・入口 | 引継ぎ |
|---|---|---|
| 園基本情報 | Tenant、PATCH /setup/tenant | 既存UI再利用、連絡先/名称必須確認 |
| クラス/部署 | ClassStaffingRequirement、Department/StaffDepartmentAssignment | 年齢区分は既存、部署API新設。部署UIはPhase3へ |
| 職員 | Staffと本人Membership、/staff | 独立管理者と職員を区別、匿名デモ |
| 雇用/勤務条件 | Staff、StaffWorkContract、StaffWorkRule | 既存enumの範囲と導入可能条件を提示 |
| 勤務パターン | WorkPattern、/work-patterns | 契約の実効Featureに応じて編集 |
| 必要人数 | TenantShiftSetting / ClassStaffingRequirement / ShiftStaffingRequirement | 通常/曜日/属性/期間を既存モデルで表現、既定を確定値にしない |
| 固定勤務 | StaffWorkRule FIXED_WORK_PATTERN等 | 既存generator再利用、個別条件の明示入力 |
| 休園日・行事 | TenantClosedDate / TenantEvent / TenantRuleException | 個別日・運営曜日を別に扱う |
| 希望休ルール | ShiftRequest・承認権限・月次提出 | 任意の締切/件数上限のTenant設定は未実装、後続要件として保持 |
| 有給設定 | PaidLeaveGrant/Usage/Allocation | 日/半日、初期残高、付与・取得・取消訂正を再利用。独自法定計算は追加しない |
| 生成条件 | TenantShiftSetting + 各rule/requirement + 月次回答 | 既存安全検証・DRAFT/FINALを維持 |

新規DBモデルの追加は不要だった。今回一般化は部署設定APIに限定。
「すべての園が現在すぐ導入可能」とは判定しない。Phase3は既存モデルで表現できる園の
導入フロー・設定確認・不足条件の明示を進める。モデルを超える要件はBASEへの直書きで回避しない。

## 契約Fail Closedと画面一致

- 契約欠落・未知plan/status・試用期限欠落/不正に加え、負/小数/過大な職員上限、
  TRIAL planのACTIVE化、逆転期間、開始前契約を拒否。
- 期限切れ有料契約も、statusがACTIVEのままでも機能を閉じる。
- 明示ACTIVEで期間未設定の既存手動契約は維持。PAST_DUEは既存猶予を維持するが明示期限を超えれば閉じる。
- 職員作成は契約行lock取得後にも同じ検証を行う。運営APIも変更後の組合せを検証してから保存する。
- /featuresと/subscriptionの機能表示は同じresolveVerifiedFeatureを使う。
  Web契約画面は/featuresの実効権限を取得し、日本語で表示。取得失敗時は開放表示しない。
- TRIAL/STANDARDは基本生成、PROFESSIONALは既存高度機能。TENANT_CUSTOM_RULESはプランで自動開放しない。
- 既存有効overrideは維持。契約が閉じているとoverrideは開放できない。

## Phase 2判定

変更と匿名隔離テスト完了でPhase2完了。Phase3着手可能、販売READYではない。
保留: 部署等の導入UI、任意クラスの前方Migration設計、希望休の設定範囲、運営権限の細分化、
最新Security RC/全端末E2E。Windows配布器・規約最終本文・本番課金・deployは未実施。
PRODUCT修正をPilotへ自動backportしない。適用時は契約/旧作成API利用の棚卸しが必要。
