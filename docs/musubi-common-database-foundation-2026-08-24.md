# むすび実データ対応・共通DB基盤（2026-08-24）

## 結論

むすび専用DBは作成しない。既存のTenant、Staff、WorkPattern、StaffWorkRule、StaffAttribute、ShiftRequest、ShiftAssignment、StaffWorkContract、Phase 4-A Paid Leaveを基礎に、不足していた共通構造だけを追加した。

正式DBおよび原本Excelは変更していない。実名を含む解析結果はGit外の非公開領域だけに保存する。

## Excel監査（匿名集計）

- 1シート、23職員
- 正職14名、パート9名
- 保育部門18名、子育て支援センター2名、給食室3名
- 平日勤務パターン5種、土曜勤務パターン3種
- 固定時間、固定パターン、曜日制約、希望休、有給、半日有給、早退、長期休暇、行事、土曜希望を確認
- Excel日付シリアルと文字列日付の混在を確認

## 再利用した既存モデル

- `Tenant`: 園単位の分離
- `Staff`: 職員・雇用形態・基本勤務可否
- `WorkPattern`: 園ごとの勤務帯と時刻
- `StaffWorkRule`: 固定勤務、曜日・勤務帯の可否、回数・時間上限
- `StaffAttributeDefinition/Assignment`: 役割・資格・経験者・ベテラン等
- `ShiftStaffingRequirement`: 属性保有者の最低人数
- `ShiftRequest/ShiftAssignment`: 希望休・有給申請・確定配置
- `StaffWorkContract`: 所定労働時間
- `PaidLeaveGrant/Usage/Allocation`: Phase 4-A有給管理

## 追加した共通構造

- `Department`: 保育、支援、給食、看護、事務、用務等へ共通利用できるTenant別部署マスタ
- `StaffDepartmentAssignment`: 開始・終了日を持つ職員所属履歴
- `ShiftStaffingRequirement.workPatternId`: 「勤務帯④に経験者1名」のような勤務帯別属性要件
- `ConditionalShiftStaffingRequirement`: ある属性保有者が指定勤務帯に一定人数入った場合、別勤務帯に別属性を必要とする最小条件
- Staff属性関連の複合外部キー: 子と親の`tenantId`を同時に照合し、別園IDの参照をDB自身が拒否

## むすび固有設定として保持するもの

- ①〜⑧の時刻・必要人数
- 平日／土曜の曜日設定
- 固定担当者、経験者・ベテランの属性割当
- 条件付き配置の閾値と対象勤務帯
- 行事日、希望日、長期休暇、個人別勤務条件

園名、個人名、具体的な時刻・必要人数は共通schema・共通seed・共通コードへ埋め込まない。

## 給食室

給食室職員も`Staff`としてシフト表へ表示する。`Department=FOOD_SERVICE`、職種属性、個別の固定`WorkPattern/StaffWorkRule`で表現し、`GENERATOR_EXCLUDED`属性により保育ローテーションから分離できる。「給食室だから固定」というコード分岐は設けない。

## ベテラン・経験者

専用テーブルは作成しない。既存`StaffAttributeDefinition/Assignment`にTenant別の経験者・ベテラン属性を定義し、`ShiftStaffingRequirement.workPatternId`で勤務帯別最低人数を設定する。組合せ条件だけを`ConditionalShiftStaffingRequirement`で表現する。

## Excel取込

ImporterはDB書込みを行わず、`Excel → 解析 → 正規化 → validation → 確認JSON`までを担当する。確認JSONは`VALIDATED_NOT_APPROVED`状態で生成し、不明点が残る限り`readyForDatabase=false`とする。テストは匿名入力だけを使用する。

最終監査では、明確変換可能なExcelシリアル日付を正規化し、確認項目27件（管理者確認15件、変換候補12件）を匿名IDとセル位置で残した。代表的な要確認値は`9/119/14`、`9/9/・9/29 p.m`、`9/26●`、勤務番号を連結した日付列、具体時間を伴う早退、番号⑨（定義外候補）である。推測修正はしていない。

## 検証

- Prisma validate、API lint/build: PASS
- 空の隔離PostgreSQLへの全27 Migration適用: PASS
- 既存seed: PASS
- 新規モデル通常書込み4件・Tenant越境拒否5件: PASS
- 既存Tenant Phase 1制約: PASS
- Phase 4-A有給（全日・半日・残高・取消・訂正・監査・並行処理）: PASS
- 主要API回帰、シフト生成、StaffWorkRule、StaffAttribute、StaffingRequirement: PASS
- Release 1回帰: PASS
- Web lint/build/全回帰: PASS
- Importer正規化テスト: PASS

初回API全回帰はテスト用`JWT_SECRET`不足でRelease 1途中停止したが、同じ隔離環境で正しいテスト用Secretを設定して該当スイートを再実行し、全件PASSを確認した。

## 未確定・次の作業

- 管理者が確認項目27件を原本と照合して確定する。
- 確定後、実名を含む承認済み投入データをGit外で生成する。
- 2026年9月Tenant設定、部署、属性、勤務パターン、個人ルール、希望休・有給候補を隔離DBへdry runし、件数差分を人間承認する。
- 正式DB投入は別承認とし、この作業では実施しない。
