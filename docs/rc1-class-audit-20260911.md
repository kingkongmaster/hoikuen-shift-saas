# RC1 配置クラス43件監査

2026-09-11 / PHASE4_RELEASE_GATE_FIX_VERIFIED

## 結論・正式分類

C GENERATOR_CLASS_ASSIGNMENT_REGRESSION。2030年1月の汎用demo fixtureで、AGE所属40件とSUPPORT3件の区分が消失していた。固定非保育勤務・管理者・FREEは0件。

通常保育rotationは所属AGE区分または補完先を保持する。FREE/SUPPORTは保育クラスそのものではないが、enumとして区分を保持する。nullとは別。休み・非保育固定勤務・園長運営配置なし設定ではnullを許容する。今回43件は許容対象ではない。

schemaのassignedClassはnullable enum。classId/classAssignment/department/行単位statusは存在しない。全43件はMonthlyShift=DRAFT、rotation対象、fixed=false、追加StaffAttribute=0。後工程でclassを埋める設計ではなく、そのまま保存されていた。

## 履歴・割当経路

04832e6でRC1の勤務時刻・配置保存assertを作成。e193de8で管理者除外14名を明示。eee6e14以前は所属区分を保持していた。同commitでassignClasses冒頭に全勤務null化を追加し、必要人数に選ばれなかった勤務の区分が消失した。

43件は全てassignClassesを通過。平日31件、土曜12件。平日必要数はAGE_0～3各2、AGE_4～5各1。土曜クラス別必要数は全0で、全体勤務最低人数とは別。必要数まで配置した残りの勤務が対象。

## 最小修正

無条件null化を除去し、未選択勤務の所属区分を保持。補完先への上書き、FREE_SUPPORT_COVERAGE/CROSS_CLASS_SUPPORT、早出遅出重複抑止は維持。期待値を緩和していない。

RC1へ配置後クラス別早出遅出重複0、CSV/印刷配置ラベル一致を追加。fixed-class testへ余剰所属保持、FREE/SUPPORT/CROSS_CLASS補完・不足解消を追加。

## UI/API影響

- 管理表はnull時配置ラベル空欄。DIRECTORだけ運営表示の特例があるが今回対象外。
- 個人画面はnull時配置行を省略。DRAFTは職員へ未公開。
- CSV/印刷APIはnullを空文字へ変換。修正後270勤務すべてラベルあり、両出力一致PASS。
- B4横管理表のセルは勤務記号中心で、毎セルの配置表示はない。クラスfilterではnull勤務が抽出から落ちる。既存レイアウト回帰PASS。実プリンタ・Windows実機受入は今回未実施。
- staffingはclassTypeとassignedClassの一致で集計し、nullはクラス人数に算入されない。補完配置テストPASS。
- fairnessは勤務時間・勤務区分を使用。勤務数・時間の変更なし、公平性回帰PASS。

## 検証・安全境界

43件→0件。434行（勤務270/OFF164）、管理者0、staff/date重複0、配置後クラス別早出遅出重複0。RC1のclass不要勤務null期待値0、OFF164行は別。非保育固定勤務の正当nullは既存給食室テストで維持。

API48/48、追加RC1/fixed-class test、API/Web lint/build、Web regression、tenant isolation、匿名生成PASS。DB role/secret、JSON UI/API、②希望、第三金曜、固定①/②、週1/2・週3禁止、翌日遷移、給食室・別Tenant回帰PASS。

隔離PG16 tmpfsのみ。30 migrations適用PASS、新migrationなし。Production/旧VPS/正式FINAL未操作。Critical0/High blocker0（検証範囲）。commit/push/PR/mergeなし。Notion記録済み。git diff --check PASS。

## 匿名43件一覧

全件修正前assignedClass=null。以下のStaff IDは隔離fixtureのID。Pattern空欄はShiftTypeを使用。warning欄は返却codeの当該職員・日付/共通条件一致分。

|Staff code / ID|Date|Pattern / ShiftType|Base class / Employment|Warning codes|After class|
|---|---|---|---|---|---|
|STAFF-001 / 255c89a1-7232-4fdb-bd68-8c475244dd6d|2030-01-05|EARLY / EARLY|AGE_0 / FULL_TIME|none|AGE_0|
|STAFF-001 / 255c89a1-7232-4fdb-bd68-8c475244dd6d|2030-01-12|EARLY / EARLY|AGE_0 / FULL_TIME|none|AGE_0|
|STAFF-001 / 255c89a1-7232-4fdb-bd68-8c475244dd6d|2030-01-19|EARLY / EARLY|AGE_0 / FULL_TIME|none|AGE_0|
|STAFF-001 / 255c89a1-7232-4fdb-bd68-8c475244dd6d|2030-01-26|EARLY / EARLY|AGE_0 / FULL_TIME|none|AGE_0|
|STAFF-003 / 7a065a37-ea44-460a-91c0-5a3e390fcdc4|2030-01-05|LATE / LATE|AGE_0 / REEMPLOYED|none|AGE_0|
|STAFF-003 / 7a065a37-ea44-460a-91c0-5a3e390fcdc4|2030-01-12|LATE / LATE|AGE_0 / REEMPLOYED|none|AGE_0|
|STAFF-003 / 7a065a37-ea44-460a-91c0-5a3e390fcdc4|2030-01-19|LATE / LATE|AGE_0 / REEMPLOYED|none|AGE_0|
|STAFF-003 / 7a065a37-ea44-460a-91c0-5a3e390fcdc4|2030-01-26|LATE / LATE|AGE_0 / REEMPLOYED|none|AGE_0|
|STAFF-004 / 78482b09-43ce-4ce5-83dc-e3c13dd97500|2030-01-12|NORMAL / NORMAL|SUPPORT / FULL_TIME|none|SUPPORT|
|STAFF-004 / 78482b09-43ce-4ce5-83dc-e3c13dd97500|2030-01-19|NORMAL / NORMAL|SUPPORT / FULL_TIME|none|SUPPORT|
|STAFF-004 / 78482b09-43ce-4ce5-83dc-e3c13dd97500|2030-01-26|NORMAL / NORMAL|SUPPORT / FULL_TIME|none|SUPPORT|
|STAFF-005 / 7f900058-b428-4781-90de-c252e73e1303|2030-01-05|NORMAL / NORMAL|AGE_1 / FULL_TIME|none|AGE_1|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-01|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-02|LATE / LATE|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-03|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-04|EARLY / EARLY|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-07|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-08|LATE / LATE|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-09|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-10|EARLY / EARLY|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-14|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-15|LATE / LATE|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-16|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-17|EARLY / EARLY|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-21|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-22|LATE / LATE|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-012 / ed40dc1d-d5a2-4b8f-b45b-ed004e21302a|2030-01-23|NORMAL / NORMAL|AGE_4 / FULL_TIME|none|AGE_4|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-01|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-02|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-03|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-04|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-07|LATE / LATE|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-08|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-09|EARLY / EARLY|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-10|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-14|EARLY / EARLY|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-15|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-16|LATE / LATE|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-17|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-21|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-22|EARLY / EARLY|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-23|NORMAL / NORMAL|AGE_5 / FULL_TIME|none|AGE_5|
|STAFF-014 / 8e186cb1-b300-4668-a9e1-954de5a00693|2030-01-31|LATE / LATE|AGE_5 / FULL_TIME|TARGET_WORK_DAYS_EXCESS,TARGET_WORK_HOURS_EXCESS|AGE_5|
