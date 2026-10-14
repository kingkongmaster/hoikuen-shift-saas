# 開発・ログ・Gitスコープ規則

適用開始: 2026-10-14。主開発はPRODUCT。既存PilotはMUSUBI保守。

## 正式ログ保存先

| Scope | 保存先 | 記録するもの |
|---|---|---|
| PRODUCT | [AeN Shift Product / SaaS](https://app.notion.com/p/3f9f7197f53d816cadafddc557306e7b) 配下の新規詳細ページ | BASE、Tenant、導入、プラン、販売、法務、Security、PWA、匿名Demo、RC、共通運用 |
| MUSUBI | [Musubi Pilot / Custom](https://app.notion.com/p/3f9f7197f53d81b89a95d6bfb33586c4) 配下の新規詳細ページ | Pilot障害、現地PC、要望、園固有条件、保守・Production対応の記録 |
| SHARED | [AeN Shift Shared Decisions](https://app.notion.com/p/3f9f7197f53d8133bce4f0af1bc9aaef) | 両系統の共通判断・理由・適用範囲・元ログ参照だけ |

既存3ページを再利用。新規DB、課金プラン、アクセス権変更は行わない。
過去AI共用ログは削除・移動・一括修正しない。分離前に今日作成した記録も
元の場所に残す。新規情報だけ各scopeへ記録する。詳細の二重保存をしない。

## 開始時の判定

1. 第三者の園にも必要な製品要件・機能はPRODUCT。
2. 実園の個別要望、実データ、現地環境、既存稼働の保守はMUSUBI。
3. 共通原則を変える、または両系統で動く共通コードを変える場合はSHAREDの
   影響確認を追加する。主実装ログは発端のscope、共通決定はSHAREDに短く記録。
4. 複合タスクは作業単位・commit単位で分割。単に共通リポジトリ内にあるという
   理由だけで、すべてをSHAREDにしない。ログ名を使って個人情報を正当化しない。
5. 開始時にscope／目的／branch／環境／変更禁止対象／テスト先を明示。

## Gitとリリース

- 単一リポジトリ・単一共通BASEを維持。Tenant設定とCustom extensionで差を表す。
- `main`は統合先候補だが、現在のmainが最新Pilotを含むとは仮定しない。
  差分・既存Gateを確認してからPRで統合する。今回mainは変更しない。
- PRODUCTは短命の`codex/product-*`作業branchを基本とする。現在の
  `codex/commercial-saas-release`は既存の製品化作業branchとして継続する。
- MUSUBI修正は稼働中の記録済みSHAから`codex/musubi-fix-*`を切る。
  古いPilot branchの先端と稼働SHAが同じとは仮定しない。
- SHAREDは`codex/shared-*`または独立した`docs(shared):`等のcommitに分離。
  共通修正は匿名再現テストを添えProduct統合先へ還流し、Pilotへは必要な
  修正だけをcherry-pick／backportする。販売版branch全体をPilotへmergeしない。
- 共通修正ごとにProductとPilotの影響、テスト結果、適用SHAを記録する。
  リリース済みの版差は許容するが、常設の別製品forkにはしない。
- push前にPII／secretとCIトリガー・費用を確認。pushはdeploy承認ではない。
- Production deploy、DB migration、正式データ変更は別の明示承認で実施。

## 個人情報と検証

PRODUCTのログ・fixture・Demo・テストは匿名のみ。実データを名前置換だけで
持ち出さず、勤務履歴や個別条件も独立した合成データにする。
MUSUBI原本は既存保護領域に残し、Notionは必要最小限のSource参照にする。
権限未確認のページには原文・実名・メールを保存しない。Notionページ分離、
filtered view、Git branchはセキュリティ境界ではない。公開GitにPIIを置かない。

ローカルDBはtest／isolatedを含む名前とlocalhost接続を必須とする既存helperを使用。
販売版テストはProduction認証情報・Production URL・SSHを使わない。
通常の文書規則だけでゼロwriteが証明されたとは報告せず、実行した対象・方法を示す。

## 今回のSHARED変更の影響

Product: scope判定とログ経路が明確になる。実装・契約条件は変更しない。
Pilot: 既存ログ・稼働コード・DB・URLは変更しない。保守ログの新規保存先のみ指定。
共通表記: DRAFT（下書き）、FINAL（最終決定）、ローテーション、基本印刷A4。
A3の正式採用は検証後。新規有料サービス・追加費用0。
