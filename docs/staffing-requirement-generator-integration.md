# Foundation Sprint 6：属性別配置条件Generator接続

英語名: Staffing Requirement Generator Integration

## 目的と境界

Foundation Sprint 5で追加した `ShiftStaffingRequirement` を自動生成時に参照する。既存の希望休、勤務可否、勤務時間・連続勤務上限、早出・遅出、クラス総必要人数を変更せず、属性条件は候補の補助順位と生成後評価に限定する。既存Staff項目からStaffAttributeへの移行、WorkPattern・時間帯別条件、生成停止方式、評価結果の永続化は対象外とし、DB migrationは追加しない。

## 評価対象

- 対象園の `isActive=true` の条件だけを参照する。
- 対象日が包含境界の有効期間内で、`dayOfWeek` が未指定または一致する条件だけを評価する。
- `classType=null` は園全体、指定ありは当日の該当クラス勤務者を母集団とする。クラス条件は総必要人数の内訳であり加算しない。
- 有効なStaff、属性定義、属性割当だけを対象とし、属性割当の包含境界の有効期間を日ごとに判定する。
- ROLE、QUALIFICATION、ASSIGNMENT、SKILLを同じ方法で扱う。ASSIGNMENT属性とシフト上の担当クラスは別概念である。
- 勤務扱いの割当だけを数え、条件・日付ごとに職員IDを一意化する。

## 制約レベルと候補順位

- HARD: 既存の適格候補のうち未達条件を満たせる職員を優先する。未達はERRORだが生成は成功させる。
- SOFT: HARDの次に候補を優先する。未達はWARNINGとする。
- INFO: 候補順位を変更せず、達成・未達にかかわらずINFO評価を返す。
- 既存の勤務不可等の適格性判定を属性条件で上書きしない。属性優先度が同じ候補間は従来の専任区分、早遅回数、勤務量、公平性、職員番号順を維持する。
- クラス指定条件は、そのクラスへの配置候補を選ぶ段階でも同じHARD、SOFT順を使う。

## 生成後評価とAPI

Featureが有効で有効条件がある場合のみ、既存生成レスポンスへ後方互換なoptional項目 `staffingRequirementEvaluations` を追加する。各要素は `requirementId`、`code`、`name`、`date`、`classType`、`constraintLevel`、`requiredCount`、`actualCount`、`isSatisfied`、`matchedStaffIds`、`message`、`level` を含む。

HARD未達はERROR、SOFT未達はWARNING、INFOは常にINFOとして既存warningsと集計へ統合する。HARD/SOFT達成は評価結果には含めるがwarningsには追加しない。評価結果はDBへ保存しない。

## Featureと障害時動作

`ADVANCED_STAFFING_REQUIREMENTS` が有効な園だけ新条件を使う。Feature OFFまたは条件0件では新オプションをGeneratorへ渡さず、従来のレスポンス形状と生成結果を維持する。Feature状態取得に失敗した場合は新条件を適用せず従来生成へフォールバックし、生成自体は止めず専用WARNINGとAuditLog概要を残す。

## AuditLog

既存 `SHIFT_GENERATED` を維持し、Feature適用状態、評価条件数、HARD未達数、SOFT未達数、INFO数、Feature判定失敗の有無だけをmetadataへ追加する。条件詳細や職員ID一覧は保存しない。

## Web UI

既存の自動生成結果欄へ属性別配置条件の評価一覧を追加し、HARD未達、SOFT未達、INFOを区別して、条件名、対象日、対象クラス、必要人数、実人数を表示する。optional項目がない場合は表示しない。管理画面の案内は「この配置条件は自動シフト生成時に評価されます。」へ更新し、HARD、SOFT、INFOの説明を添える。既存シフト表、印刷、CSVには変更を加えない。

## 受入条件

- Feature OFF、およびFeature ON・条件0件で既存Generator 12シナリオの割当と既存レスポンスが不変である。
- HARD、SOFT、INFO、園全体、クラス、曜日、期間境界、属性割当期間、inactive、tenant分離、複数条件、重複計上防止を日付単位で検証する。
- HARD未達でも生成が成功しERROR、SOFT未達はWARNING、INFOは順位不変でINFOとなる。
- 属性条件が既存の勤務不可条件を破らない。
- Feature判定失敗時に従来生成へフォールバックする。
- 既存の生成権限、StaffWorkRule、StaffAttribute、ShiftStaffingRequirement、ClassStaffingRequirement、Staff API、バックアップ、AuditLogを回帰確認する。
- Prisma validation、API/Web本番build、単体・Web・隔離PostgreSQL API統合テスト、`git diff --check` を通す。

## 将来検討

WorkPattern・時間帯別条件、複数属性AND/OR、HARD未達時の契約園別生成停止、配置可能人数プレビュー、評価結果の履歴保存、既存Staff項目とStaffAttributeの統合は別Sprintで扱う。
