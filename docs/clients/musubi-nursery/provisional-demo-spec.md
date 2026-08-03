# 仮運用デモ仕様

専用fixtureはREG-01～15、SHORT-01、MANAGER-01、PART-01～04、SUPPORT-01～02の23名だけを匿名コードで定義し、24人目を作成しません。setupは既定でdry-run（試運転）し、`--apply`指定時だけ明示された非production PostgreSQLへ1トランザクションで投入します。同じtenant codeと職員コードへupsertするため再実行しても重複しません。

Generatorは既存Staff設定だけを使用します。SUPPORT-01は早出専任、SUPPORT-02、SHORT-01、PART-01～04は個別通常時間を使います。管理職MANAGER-01はADMIN membershipで候補から除外します。REG-14～15は役職を付けず、専用のGENERATOR_EXCLUDED属性とTENANT_CUSTOM_RULESによる汎用除外フックで候補から除外します。園名や固有値を共通Generatorへ追加しません。

専用確認APIは、年齢クラスを乳児・幼児へ仮集計し、最新の生成結果から勤務区分・時間・経験属性を確認します。遅出担当がテスト用新人だけの日はERRORを返しますが、生成を停止しません。勤務希望、障害児加配人数、正式グループ人数は次回確認事項として表示します。

仮必要人数は年齢別画面とシフト設定画面から変更可能です。正式なグループDB、勤務希望DB、WorkPattern別属性条件は追加しません。
