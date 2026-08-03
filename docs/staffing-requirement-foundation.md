# Foundation Sprint 5：属性別配置条件基盤

English name: **Staffing Requirement Foundation**

## 1. 文書の位置付け

本書は、新しいFoundation系列におけるSprint 5の正式仕様である。既存READMEには、過去の開発系列として「Sprint 5＝ルールベース自動生成」という表記があるが、本Sprintとは別の系列である。混同を避けるため、本書および今後の関連文書では本Sprintを **Foundation Sprint 5** と表記する。

## 2. 目的

`StaffAttributeDefinition`を参照し、特定の属性を持つ職員が園全体またはクラス単位で何人必要かを、安全に保存・管理する共通基盤を追加する。

本Sprintは配置条件の保存、検証、表示、監査およびバックアップまでを対象とする。Generatorには接続せず、既存のシフト生成結果、生成スコアおよび事前チェックを一切変更しない。

園固有の資格名、役割名、必要人数、職員名および具体的勤務条件は、共通デフォルトやseedへ埋め込まない。

## 3. 責務と既存機能との境界

- `TenantShiftSetting`は、園全体の運用およびシフト生成設定を扱う。
- `ClassStaffingRequirement`は、クラスごとの総必要人数を扱い、既存Generatorから参照される。
- `StaffWorkRule`は、個々の職員の勤務可否、勤務パターンおよび個人別制約を扱う。
- `StaffAttributeDefinition`と`StaffAttributeAssignment`は、職員が持つ役割、資格、担当および技能を扱う。
- `ShiftStaffingRequirement`は、特定属性を持つ職員が園全体またはクラス単位で何人必要かを扱う。

`ShiftStaffingRequirement`は`ClassStaffingRequirement`の代替ではなく、属性別の内訳条件を独立して表現する。`ASSIGNMENT`カテゴリのStaff属性と、シフト上の担当クラスは別概念として扱い、暗黙に相互変換しない。

## 4. データモデル

モデル名は`ShiftStaffingRequirement`とする。

### 4.1 フィールド

| フィールド | 概要 |
| --- | --- |
| `id` | 主キー |
| `tenantId` | 所属テナント |
| `code` | テナント内で一意の識別コード |
| `name` | 表示名 |
| `attributeDefinitionId` | 単一の`StaffAttributeDefinition`参照 |
| `classType` | nullable。nullは園全体、指定時は対象クラス |
| `dayOfWeek` | nullable。0〜6の曜日 |
| `startDate` | nullable。有効期間開始日 |
| `endDate` | nullable。有効期間終了日 |
| `requiredCount` | 必要人数。1以上 |
| `constraintLevel` | `HARD`、`SOFT`または`INFO` |
| `reason` | nullable。条件の理由・説明 |
| `displayOrder` | 表示順 |
| `isActive` | 論理的な有効状態 |
| `createdAt` | 作成日時 |
| `updatedAt` | 更新日時 |

### 4.2 制約レベル

`constraintLevel`は次のenum値を持つ。

- `HARD`
- `SOFT`
- `INFO`

Foundation Sprint 5では保存と表示のみを行う。Generator、生成失敗判定、スコアリング、警告表示では解釈しない。既存の表示上の重大度（INFO、WARNING、ERROR等）とも別概念である。

### 4.3 必要人数

`requiredCount`は1以上とし、0は許可しない。条件を適用しない場合は、人数を0へ変更するのではなく論理無効化する。

### 4.4 対象範囲

- `classType = null`は園全体を表す。
- `classType`指定時は、そのクラス単位の条件を表す。
- WorkPattern、勤務時間帯および具体的なシフト種別は対象外とする。

### 4.5 属性条件

1件の条件は、同一テナントに属する単一の`StaffAttributeDefinition`のみを参照する。複数属性のAND／OR条件は表現しない。

## 5. 日付と曜日

- `dayOfWeek`はnull、または0〜6とする。
- `startDate`と`endDate`は、両方指定または両方nullとする。
- `startDate`は`endDate`以下でなければならない。
- `startDate = endDate`で特定日を表現する。
- 特定日と`dayOfWeek`を併用する場合、指定日の実際の曜日と一致しなければ拒否する。
- `dayOfWeek = null`は、指定期間内の全日を表す。
- 期間なし、曜日ありは、無期限の指定曜日を表す。
- 期間なし、曜日なしは、無期限の全日を表す。

日付境界は包含して判定する。

## 6. 重複判定

次の値がすべて同じactive条件を、同一条件キーとして扱う。

- `tenantId`
- `attributeDefinitionId`
- `classType`
- `dayOfWeek`

同一条件キーの有効期間が重なる場合は409相当で拒否する。重複条件の加算、上書き、暗黙の期間分割は行わない。

期間の重複は境界を包含し、期間Aと期間Bについて`startA <= endB && startB <= endA`で判定する。無期限の条件は、同一条件キーを持つほかのすべての期間と重複する。重複判定の対象はactive条件のみとする。

## 7. codeとライフサイクル

- `code`はテナント内で一意とする。
- 作成後の`code`変更は原則許可しない。
- 物理削除は行わず、`isActive`によって論理無効化する。
- 再有効化操作を提供する。
- 無効条件と同じ`code`を再利用しようとした場合、新規行は作成せず、既存行を現在の入力規則、参照整合性および重複規則で再検証して再有効化することを基本とする。
- 再有効化時に競合や不正な参照がある場合は拒否し、既存行を無断で変更、分割または上書きしない。

## 8. 権限

| ロール | 閲覧 | 作成・更新 | 無効化・再有効化 |
| --- | --- | --- | --- |
| ADMIN | 可 | 可 | 可 |
| DIRECTOR | 可 | 不可 | 不可 |
| STAFF | 不可 | 不可 | 不可 |

すべての操作で既存の認証・ロール判定を適用する。

## 9. Feature entitlement

- 使用するFeature keyは`ADVANCED_STAFFING_REQUIREMENTS`とする。
- 作成、更新、無効化および再有効化の書き込み操作にFeature有効化を必須とする。
- Feature OFFでも、権限を持つADMINとDIRECTORは読み取り可能とする。
- Feature状態の取得または判定に失敗した場合、書き込みはfail-closedで拒否する。
- `TENANT_CUSTOM_RULES`は使用しない。

Web UIもFeature状態を安全側に扱い、状態を確認できない場合は書き込み操作を表示・許可しない。ただしAPI側の認可を最終境界とする。

## 10. テナント分離と参照整合性

- 取得、作成、更新、無効化および再有効化のすべてで、認証テナントを検索条件と検証条件に含める。
- IDだけによるテナント横断取得・更新を行わない。
- 参照する`StaffAttributeDefinition`が同一テナントに属することをサービス層で強制する。
- 他テナントの属性定義を指定した操作は、情報漏えいを避ける既存API規約に従って拒否する。
- Foundation Sprint 5では複合foreign keyを追加しない。
- 直接SQL等、サービス層を通らない書き込み経路が将来増えた場合は、`tenantId`を含む複合foreign keyを再検討する。

## 11. AuditLog

次の成功操作をAuditLogへ記録する。

- 作成
- 更新
- 無効化
- 再有効化

監査イベント名とmetadata形式は既存のStaffWorkRuleおよびStaffAttributeの規約に合わせる。認可、Feature、入力検証、テナント分離、参照整合性または重複判定で拒否された操作は記録しない。

`reason`等を監査metadataへ含める場合は、既存の長さ制限、制御文字拒否および機微情報を保存しない方針に従う。

## 12. バックアップ

- 現行バックアップ形式に`shiftStaffingRequirements`をoptional配列として追加する。
- 項目を持たない旧バックアップは、空配列として扱う。
- 現行バックアップバージョンを維持する。
- inactive条件も履歴・再有効化のため出力対象とする。
- 復元検証では、テナント分離、`StaffAttributeDefinition`参照、enum、必須項目、日付、曜日、人数およびcode一意性を確認する。
- active条件について重複を検証する。
- 他テナントまたは存在しない属性定義への参照は拒否する。

## 13. API案

既存のルーティングおよびレスポンス規約に合わせ、次のtenant-scoped APIを提供する。

- `GET /api/staffing-requirements`：一覧取得。ADMIN、DIRECTOR
- `POST /api/staffing-requirements`：作成、または同一codeのinactive条件の再有効化。ADMINかつFeature ON
- `PUT /api/staffing-requirements/:id`：更新または明示的な再有効化。ADMINかつFeature ON
- `DELETE /api/staffing-requirements/:id`：論理無効化。ADMINかつFeature ON

一覧はactive／inactive双方を管理画面で扱えるものとし、必要に応じて状態、クラス、属性、曜日および期間でフィルタ可能にする。Foundation Sprint 5ではGenerator用の取得APIや配置可能人数プレビューAPIを追加しない。

## 14. Web UI

園設定内に「属性別配置条件」を独立した設定領域として追加する。既存の`ClassStaffingRequirement`画面とは分離する。

画面では次を提供する。

- 一覧
- 登録
- 編集
- 論理無効化
- 再有効化
- 園全体／クラスの表示
- 属性カテゴリおよび属性名の表示・選択
- 曜日、期間、必要人数、制約レベル、有効状態の表示・入力

画面上に「現在は自動生成には反映されません」と明示する。DIRECTORおよびFeature OFF時のADMINには読み取り専用で表示し、STAFFには画面・ナビゲーションを提供しない。

## 15. Generatorからの分離

- Generatorを変更しない。
- `ShiftsService`を変更しない。
- 既存の生成スコア、事前チェックおよび警告処理を変更しない。
- Generatorから`ShiftStaffingRequirement`を参照・読込しない。
- `HARD`による生成失敗、`SOFT`スコアリング、`INFO`警告表示を実装しない。
- 既存Generatorテストの入力と出力が不変であることを受入条件とする。

Generator接続は、`ClassStaffingRequirement`、既存Staff項目、StaffWorkRule、StaffAttributeおよび本モデルの優先順位と充足判定を正式に定義する将来Sprintで行う。

## 16. migration方針

migrationは追加のみとする。

- `constraintLevel`用enumの追加
- `ShiftStaffingRequirement`テーブルの追加
- 必要なindex、unique constraintおよびforeign keyの追加
- 既存テーブルのデータ変更、削除およびbackfillは行わない
- 既存migrationを変更しない
- seedへ園固有の配置条件を追加しない

想定indexには、テナント内code一意制約、tenantとactive状態による一覧取得、属性定義参照、および重複候補検索を支援するものを含める。期間重複は通常のunique制約だけでは表現できないため、サービス層のtransaction内で検証する。

空DBへの全migration適用と、既存データを持つ隔離DBへの追加適用を検証し、適用前後で既存Staff、StaffAttribute、StaffWorkRule、ShiftおよびAssignmentデータが変化しないことを確認する。

## 17. Foundation Sprint 5対象外

- Generatorへの適用
- `HARD`条件による生成失敗
- `SOFT`スコアリング
- `INFO`警告表示
- WorkPattern別条件
- 時間帯別条件
- 具体的なシフト種別ごとの条件
- 複数属性AND／OR
- 配置可能人数プレビュー
- 園固有ルール
- 既存Staff項目からStaffAttributeへの移行
- 複合foreign key

## 18. テスト計画と受入条件

### 18.1 モデル・サービス・API

- 作成、一覧、更新、論理無効化および再有効化が成功する。
- `requiredCount < 1`を拒否する。
- `dayOfWeek`の範囲外を拒否する。
- 片方だけの日付、開始日が終了日より後の期間を拒否する。
- 特定日と一致しない`dayOfWeek`の併用を拒否する。
- 無期限、期間あり、境界日を含む重複を拒否する。
- 異なる属性、クラスまたは曜日の条件を誤って重複扱いしない。
- 重複条件を加算、上書きまたは暗黙に期間分割しない。
- 他テナントの条件および属性定義へアクセスできない。
- ADMIN、DIRECTOR、STAFFの権限表どおりに動作する。
- Feature OFF時とFeature判定失敗時に書き込みを拒否する。
- 同一codeのinactive条件を、新規行を作らず再検証して再有効化する。
- rejected操作でAuditLogを作成せず、成功した4操作を正しく記録する。

### 18.2 バックアップ

- `shiftStaffingRequirements`を出力できる。
- inactive条件を含めて出力できる。
- 配列を持たない旧形式を空配列として受理できる。
- tenant越境、欠落参照、不正enum、不正日付、不正人数、code重複およびactive期間重複を拒否する。
- 現行バックアップバージョンを維持する。

### 18.3 Web

- 園設定内の独立画面で一覧、登録、編集、無効化および再有効化が行える。
- 必要な全項目と有効状態を表示できる。
- Generator未接続の注意文を表示する。
- DIRECTORとFeature OFF時は読み取り専用になる。
- STAFFには画面・操作を公開しない。
- loading、empty、errorおよびFeature判定失敗状態を安全に扱う。

### 18.4 回帰・ビルド・DB統合

- Prisma schema validationが成功する。
- API buildが成功する。
- Web production buildが成功する。
- 新規API統合テストが成功する。
- 既存StaffWorkRule、StaffAttributeおよびStaff APIの回帰テストが成功する。
- 既存Generatorテストの出力が不変である。
- Generatorおよび`ShiftsService`が新モデルを参照しない。
- 空の隔離PostgreSQLで初回から最新までmigrationを適用できる。
- 既存データを持つ隔離DBで、migration前後の既存データ件数と主要項目が不変である。
- `git diff --check`が成功する。
- 実装コミット時の作業ツリーがcleanである。

正式DB、共有DB、外部サービスおよび本番環境は検証に使用しない。

## 19. 実装時の予定変更範囲

実際のファイル名は既存構成の詳細設計時に確定するが、変更範囲は原則として次に限定する。

- Prisma schema
- 新規の追加migration
- Staffing Requirement用API controller、service、module、DTOおよびテスト
- Feature entitlementと認可の既存接続箇所
- AuditLogイベント定義または既存監査呼出し
- バックアップ型、export、validationおよびテスト
- 園設定内の属性別配置条件ページ、API client、型、ナビゲーションおよびWebテスト
- 本仕様書および必要最小限のREADME／テスト実行手順

Generator、`ShiftsService`、既存生成スコアおよび既存migrationは変更対象に含めない。

## 20. 完了定義

本Sprintは、属性別配置条件をtenant-scopedに保存・管理でき、権限、Feature、監査、バックアップおよび入力整合性が検証され、既存データとGenerator出力に変化がないことを確認した時点で完了とする。
