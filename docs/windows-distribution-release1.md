# AeN Shift Release 1 Windows配布設計

## 選定方式

Release 1は、既存React/Vite PWAを権威あるアプリ本体として維持し、Inno Setup製の軽量なWindows `.exe` セットアップからHTTPSのAeN Shift SaaSを開く。ElectronやTauriのリモートWebラッパーは採用しない。

| 方式 | 長所 | Release 1判断 |
| --- | --- | --- |
| PWAの手動インストール誘導 | 最軽量、既存構成をそのまま利用 | 利用者操作が増えるため補助導線として維持 |
| 軽量URLランチャー＋Windowsセットアップ | `.exe`、アイコン、アンインストールを最小構成で提供 | **採用** |
| Tauri | 軽量なWebView shell、将来native連携可能 | 今回はRust/Windows packagingとremote content境界が過剰 |
| Electron | packaging実績が多い | Chromium同梱の容量・更新・攻撃面が目的に対して過剰 |

インストーラーはSaaSの公開HTTPS URLだけをビルド時に受け取る。DB、API秘密鍵、管理者パスワード、職員データ、私有資料、匿名対応表は入力にも成果物にも含めない。認証は従来どおりWebのログイン画面からSaaS APIへ行う。

## バージョンと更新

- 配布表示: `AeN Shift / Release 1 / Musubi Trial`
- 配布version: `1.0.0-musubi.1`
- Inno Setupの安定した`AppId`により、次版は同じID・上位versionで上書きできる。
- Release 1は手動更新。自動更新は、署名・配布元・ロールバック・整合性検証を揃えるまで導入しない。
- SaaS本体の更新は従来のWeb deploymentで行い、ランチャー更新を不要にする。

## ダウンロード保護の比較

| 選択肢 | 評価 |
| --- | --- |
| 完全公開URL | 検索・転送・再配布を抑えられないため試用版には不採用 |
| 推測困難URLだけ | `noindex`と併用しても、URL転送後の制御がなく単独では不足 |
| 共有password | 導入は簡単だが共有・退職・漏えい時の追跡と失効が弱い |
| 一時token付きURL | installer単体の取得に適するが、期限切れ時の園側案内が必要 |
| 管理者ログイン／Access gateway | 個人単位の許可・失効・監査が可能で最も安全 |

推奨は、園の指定メールアドレスだけを許可するAccess gatewayまたは管理者ログイン配下に配布ページを置き、実ファイルは短時間の署名付きURLで配る方式。Release 1で専用ECや独自認証を新設せず、既存の信頼できるアクセス制御を利用する。公開前にHTTPS、`noindex`、アクセスログ、期限、SHA-256、最新版だけを表示することを確認する。

## SmartScreenと署名

未署名の新しい`.exe`はMicrosoft Defender SmartScreenで「WindowsによってPCが保護されました」と表示され、組織ポリシーやWindows 11 Smart App Controlでは実行自体が禁止される可能性がある。自己署名証明書は一般配布の信頼にはならない。

試用版で未署名配布を例外的に行う場合も、警告回避コードやWindows保護設定の無効化は行わない。配布元・ファイル名・SHA-256を別経路で伝え、園の管理者が許可したPCだけで実施する。一般販売前には、Microsoft Storeまたは信頼されたCAのRSAコード署名証明書を用いてinstaller/uninstallerを含む全実行物を一貫して署名する。署名済みでも新しい成果物はSmartScreen評価が蓄積するまで警告される可能性がある。

## OS方針

Windows 11 64-bitを推奨・正式確認対象とする。Windows 10 22H2の通常サポートは2025年10月14日に終了済みであるため、Windows 10は園がESU/LTSC等で安全に管理している場合の実機確認対象に限定する。EdgeはWindows 10 22H2で少なくとも2028年10月まで更新予定だが、ブラウザ更新だけでOS全体の安全性を代替しない。

## 実機確認境界

macOSではソース監査、既存PWA、HTML、秘密境界、CI build定義まで検証する。実際の`.exe`生成はWindows GitHub ActionsまたはWindows build machine、install/start menu/desktop/login/uninstall/reinstall/upgrade/SmartScreen/署名確認は管理されたWindows 11実機で行う。実機確認前に「むすび園へ配布可能」と判定しない。
