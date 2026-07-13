# HoikuShift SaaS v16.1 — 1園実証運用基盤

## この版で実装したもの
- Firebase Authentication
- `gardenId` による園単位データ分離
- 園長(owner) / 管理者(admin) / 職員(staff) の役割
- 新規園オンボーディング
- 招待コードによる職員参加
- スマホ月間カレンダー
- 「私の勤務」「園全体・職員」切替
- 園行事登録
- 希望休申請・管理者承認
- 園単位のシフト自動生成・Firestore保存
- GitHub Pages / Firebase Hosting 配置対応

## 公開前の必須作業
1. Firebase Console > Firestore Database > Rules に `firestore.rules` を貼り付けて公開
2. Firebase Authentication > Sign-in method で Email/Password を有効化
3. GitHub Pagesで使う場合は Authentication > Settings > Authorized domains に `ユーザー名.github.io` を追加
4. `index.html`, `config.js`, `manifest.webmanifest`, `.nojekyll` をGitHubへアップロード

## 初回利用
1. 新規アカウント作成
2. 「新しい園名」を入力して園を新規登録
3. 職員を登録（メールアドレスも登録）
4. 管理画面から招待コードを発行
5. 職員は自分のメールでアカウント作成し、招待コードで参加

## Google Calendar
`config.js` の `googleCalendarClientId` は空です。
Google Cloud Consoleで OAuth 2.0 Client ID（Web application）を作成し、承認済みJavaScript生成元に公開URLを追加してから設定してください。

このv16ではSaaS基盤と園行事DBを先に実装しています。Google Calendarの実同期はOAuthクライアントID設定後に接続処理を有効化する前提です。

## 重要
実在職員の個人情報を投入する前に、Firestore Rulesを必ず適用し、別園アカウントで相互データが見えないことを検証してください。


## v16.1 修正
旧版Firebaseアカウントに `gardenId` がない場合の白画面を修正。初期設定へ誘導し、旧プロフィールからSaaS園オーナーへ一度だけ移行できるRulesを追加。
