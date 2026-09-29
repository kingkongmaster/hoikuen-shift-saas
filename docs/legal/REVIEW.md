# Release 1 無償協力園Pilot 法務公開レビュー

製品責任者判断 AEN-POLICY-20260929-001を反映。個人開発・研究と無償協力園Pilotを対象とする。一般向け有料販売・契約・課金・請求・決済は未開始。

## 正式文面

- terms-release1-review.md: aen-terms-r1-v1
- privacy-release1-review.md: aen-privacy-r1-v1
- 施行日はProduction正式公開日。今回の固定日は2026-09-29。日を越えた場合はこのRCを公開せず、日付・本文表示と証跡を再検証する。
- API/Web同一の本文を使用し、本文hashを照合する。施行日も両側で一致必須。
- 利用料金0円。同意だけで有料契約・自動更新・請求・課金は発生しない。
- DRAFT→不足/競合→管理者確認・修正→管理者FINAL。全面免責なし。

## 実運用との照合

正式プロフィール9項目、Staff23、認証false/3をREAD ONLY確認。同意記録0件。
DB/監査記録は稼働基盤、論理backupは保護領域に保持。backup mode700/600。API/Webのログは容量ローテーションがあるが全ログ統一の日数指定はない。任意の30日/90日等を約束しない。終了時に園と出力・停止・削除を協議して処理し、backup即時全コピー消去を保証しない。
現在使用する基盤/保管/連絡経路だけを記載。国内限定保管、未確認の国外取扱国、未導入サービスは断定しない。国外取扱いの具体的な照会には契約・実運用を確認して回答する。法令上必要な情報提供等を省略する同意ではない。
事業用問い合わせは既存運用記録と一致。未開設の将来support窓口・旧placeholder・園/ADMINメールで代用しない。順次回答で時間保証なし。

## 同意の実装

利用規約とPrivacyを独立checkboxにし、両方の明示操作がある場合だけ送信。閲覧だけでは保存しない。
Tenantの両version/acceptedAtとAuditLogのTenant/User/本文hash/agreedAtをtransactionで記録。Tenant行ロックで同時送信の重複を防止。再送は追加なし。旧versionまたは本文hash不一致は409でwrite0。未承認は409。過去記録は変更しない。
管理者Setupでは旧版同意ならStep4へ戻る。職員全APIへの新しい再同意制限は導入しない。重要改定時は通知・手続を確認する。
AuditLogは既存の削除連鎖設計を持つ。終了時の削除前に園と必要な出力/証跡保持を確認する。永久・改ざん不能な外部証跡とは称さない。

## 検証と境界

390px WebKit/Chromium、全文/戻る/keyboard/focus/checkbox、API/Web lint/build、Release Gate、first-login、profile、workforce/Tenant境界を検証する。内部algorithm/score/schema/Source/AI prompt/runbookは公開しない。
ソースは19ファイル限定。schema/migration/lockfile/generator/勤務条件変更なし。Salesサイト・signup・billing変更なし。
本判断は製品責任者の方針に基づく。行政による文面承認や弁護士レビュー済みとの表示はしない。

## 販売開始前の別Gate

事業開始/開業手続、勤務先就業規則、税務、特商法、販売価格、返金、契約期間/解約、請求/決済/インボイスは販売開始前に確認する。
TRIAL 0円/最大5名/基本シフト、STANDARD月額5,500円(税込)案、PROFESSIONAL月額8,800円(税込)案を製品計画として保全。高度な園別対応は保証しない。今回は購入・実signupを開始しない。

## Source

AEN-POLICY-20260929-001: USER_PRODUCT_OWNER_DECISION。管理者による勤務条件変更ではない。
AEN-LEGAL-20260929-001: 公的法務参照、REVIEWING。法的承認ではない。
https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
https://www.caa.go.jp/about_us/about/caa_pamphlet/jp_2026_004.html
