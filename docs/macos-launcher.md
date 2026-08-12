# AeN Shift macOSランチャー

利用者が操作する入口は`~/Applications/AeN Shift.app`だけとする。

Chrome Webアプリ本体はランチャーが内部的に使用するため削除せず、`~/Library/Application Support/AeN Shift/Internal/AeN Shift Web.app`に配置する。ランチャーはDockerの既存コンテナを起動し、APIのhealth/ready確認後に内部Webアプリを開く。

正式アイコン原本は`apps/web/public/icons/AeN-Shift-icon.png`とする。白い角丸背景、グレーのカレンダー、若葉色の2枚の葉、下部の`AeN Shift`表記を含むユーザー提供画像であり、縦横比を変えずに使用する。DB名、パッケージ名、Web Storageキー、イベント名、バックアップ形式などの`enshift`内部識別子は互換性のため変更しない。

ランチャーのソースは`tools/macos/AeN Shift.applescript`で管理する。インストール済みアプリの移動・再コンパイルは、対象を確認し、バックアップを残して実施する。

AppleScriptランチャーを再コンパイルした後は、macOS標準のAppleScriptアイコンへ戻るのを防ぐため、次を実行する。このスクリプトは正式PNGからRetinaを含む全サイズのICNSを再生成し、ランチャーへ名称・アイコンを再適用してadhoc署名を更新する。

```sh
tools/macos/apply-aen-shift-branding.sh
```

利用者向けランチャーのBundle Identifierは`jp.aen.shift.launcher`、versionは`0.1.0`、buildは`20260812.1`とする。内部Chrome Webアプリは`~/Library/Application Support/AeN Shift/Internal/`に置き、Launchpadへ利用者向け入口として追加しない。内部WebアプリのBundleはChromeが管理するため直接編集・再署名しない。Webを再ビルドしてManifestを配信した後、内部Webアプリのメニューから「アプリの更新を確認」を実行し、名称とアイコンをChrome自身に再生成させる。
