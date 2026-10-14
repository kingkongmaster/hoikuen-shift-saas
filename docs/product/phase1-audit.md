# PRODUCT Phase 1: 製品構造監査と販売Gap

監査開始: 2026-10-14。基点531dde7c504577f9277ae603a2a61bdb83f79a64。
ソースと匿名ローカルDBのみを使用。コードの存在と販売品質の検証完了を区別する。
全API認可・園種別E2E・法務・販売READYの判定は未完了。

## BASE / Tenant / Custom / Option / 運営の分類

| 分類 | 対象 | コード根拠（apps/配下） | 方針 |
|---|---|---|---|
| A BASE | 認証、初回変更、ロール、所属 | api/src/presentation/auth、infrastructure/auth | 全園共通。招待・復旧・複数所属の導線を再監査 |
| A BASE | 希望休、有給/半休、未提出/0件、行事、休園 | api/src/presentation/requests、paid-leave、tenant-calendar、shifts | 申請と消化確定を分離 |
| A BASE | 生成前確認、DRAFT、不足、回答、再評価、FINAL | api/src/presentation/shifts、application/shifts | HARDを勝手に緩和しない。条件はTenant入力 |
| A BASE | 確定閲覧、交換、A4印刷/PDF、通知 | api/src/presentation/me、shift-swaps、exports、web/src/features/shifts | 一般園で通し検証。A3は未採用 |
| A BASE | Training、PWA、端末初回案内 | web/src/training、public/sw.js、features/onboarding | 匿名練習、業務write0。端末案内と園Setupを区別 |
| B Tenant | 園情報、パターン、固定、部署、必要人数 | Tenant、WorkPattern、StaffWorkRule、Department、ShiftStaffingRequirement | 名称・人数・時間を特定園へ固定しない |
| B Tenant | 年度、休日、有給、行事、個別休園 | TenantShiftSetting、TenantEvent、TenantClosedDate、PaidLeave* | 出典確認できる入力を採用 |
| B / Gap | クラス・雇用区分 | api/prisma/schema.prisma AssignedClass / EmploymentType | 固定enum。任意名・複数同年齢クラス・園種差の設計が必要 |
| C Custom | 園別取込、出典、専用ルール、表示順 | api/src/presentation/client-packages、scripts、setup/workforce-review | 拡張境界に維持。一般園の必須経路にしない |
| D Option候補 | 高度パターン、属性要件、年間公平性 | api/src/domain/features/feature-catalog、annual-work-summaries | 現権限と販売推奨を区別。料金は未決定 |
| E 運営 | 新園作成、契約、backup/restore、技術JSON | api/src/presentation/tenants、subscriptions、backups、technical-json.guard | 園UIと分離しAPI認可。運営UI不足 |

責務分類と課金プラン分類は同義ではない。実在園の職員名・個別条件は転記しない。

## Gapと受入条件

| ID | 優先 | 不足・根拠 | 完了条件 |
|---|---|---|---|
| P01 | 最優先 | POST tenantsは操作者本人を園ADMINにする | 独立管理者、原子的作成、初回変更、rollback、運営UI |
| P02 | 最優先 | SubscriptionsService.findは契約欠落をSTANDARD/ACTIVE扱い | 移行計画付きfail-closed。既存Pilotを突然停止させない |
| P03 | 最優先 | Setupで全設定の完結を未検証 | 職員・部署・勤務・曜日人数・固定・有給残高等を設定・確認 |
| P04 | 最優先 | クラス・雇用区分が固定enum | 一般園種別の表現、互換、生成、印刷、境界を検証 |
| P05 | 高 | 非PilotでtechnicalJsonEnabled、園専用Demo表示コードあり | 販売版で運営/Custom情報を露出させない |
| P06 | 高 | プラン説明とFeature Guardが別管理 | 単一の権限表と表示、期限/取消/override/API直打ち否定テスト |
| P07 | 高 | 一般園入力からFINALまでの証跡不足 | 匿名2園、月次全フロー、Tenant境界、PC/390px両エンジン |
| P08 | 販売前 | 契約・請求・支払・解約の完成未確認 | 人間受付/契約確認で動く手順。決済契約は別承認 |
| P09 | 販売前 | 販売条件・事業者・保持/SLAの確認が必要 | 専門家・人間承認。AIは法的適合を断定しない |
| P10 | 販売前 | サポート、監視、連絡、復旧演習 | PIIなし診断ログ、受付、隔離restore証跡 |
| P11 | 販売前 | 販売サイトの現行コード内所在未確認 | 既存別branch/Notion成果物を確認して再利用。公開しない |
| P12 | 販売前 | 脆弱性判定は時点依存 | RCでruntime Critical/High・未分類0、secret/PII/map0 |

## 現在のプラン実装（料金・商品仕様の承認ではない）

| Feature | TRIAL | STANDARD | PROFESSIONAL |
|---|---|---|---|
| BASIC_SHIFT_GENERATION | 有効 | 有効 | 有効 |
| ADVANCED_WORK_PATTERNS | 無効 | 無効 | 有効 |
| STAFF_WORK_RULES | 無効 | 無効 | 有効 |
| ROLE_QUALIFICATION_MANAGEMENT | 無効 | 無効 | 有効 |
| ADVANCED_STAFFING_REQUIREMENTS | 無効 | 無効 | 有効 |
| TENANT_CUSTOM_RULES | 個別許可 | 個別許可 | 個別許可 |

既存実装は人数20/50/200・試用30日。新しい販売条件として承認した意味ではない。
安全な勤務条件入力と検証は全プランで確保し、高度化の範囲を別途合意する案とする。
Guardを無断で拡大・解除しない。

## 実行順と現在地

1. Phase1: 本分類、別branch成果物の所在、保護対象とGateを確認中。
2. Phase2: 上表の優先順位と受入条件で管理。軽微改善は次版。
3. Phase3: 人間受付から独立園管理者作成、初回変更、全Setup。
4. Phase4: 匿名2園で不足・判断・再評価・FINAL後まで月次E2E。
5. Phase5: Feature Guard、画面表示、契約欠落、期限と上限。
6. Phase6: 販売・契約・解約・法務・保守の手順と承認事項。
7. Phase7: 固定SHAでRC、Security、復旧、端末UI、費用の検証。

日程確約は未実施Gateの見積り後。販売公開・料金は人間承認後。

## 先行実装・検証

P01のAPIを試作。COMMERCIAL_ONBOARDING_ENABLED=trueでのみ有効。
園、独立管理者、所属、TRIAL、Auditを1 transactionで作成する。
初回パスワード変更必須。応答・Auditにパスワード/hashを含めない。
既存園作成経路維持、新規schema/migrationなし。

- API build PASS。
- ローカル専用DBへ既存30 migration適用PASS。
- commercial-onboarding.e2e PASS: 未認証/職員/園管理者拒否、OFF拒否、弱い入力、
  重複ID時rollback、初回変更、旧token失効、Setup到達、他園sentinel不変。
- 運営UI・全Setup完了は未完了。Phase4〜7をPASSと扱わない。

追加費用0。npm offline cacheと既存ローカルDocker、匿名tmpfs DBのみ使用。
Production接続・データ読込・deploy・業務writeなし。
