# むすび保育園 仮シフト運用テスト版

2026年7月の現地ヒアリングレポート改訂版を基準に、匿名データで1か月の操作確認を行うためのクライアントパッケージです。正式納品データではなく、来週の再訪問で確認・修正するための仮運用モデルです。

- 実名、メール、住所、電話番号、生年月日は保存しません。
- 共通seed、共通Generator、既存migrationは変更しません。
- 専用fixtureとsetup scriptはproductionで実行できません。
- 確認済み、仮設定、未確認を画面と文書で区別します。

匿名職員は、正規15名、短時間1名、管理職1名、パート4名、子育て支援2名の計23名です。Generator候補はREG-01～13、SHORT-01、PART-01～04、SUPPORT-01～02の20名、対象外は役割未確認のREG-14・REG-15とMANAGER-01の3名です。REG-14・REG-15の役職は推測しません。

> 総職員数は24名と伺っていますが、現在確認できる職員区分は23名分です。残り1名は次回訪問時に確認します。

関連文書は [requirements.md](requirements.md)、[provisional-demo-spec.md](provisional-demo-spec.md)、[pre-delivery-checklist.md](pre-delivery-checklist.md) です。
