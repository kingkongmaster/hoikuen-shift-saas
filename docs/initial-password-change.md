# 初期管理者の初回パスワード変更

## 初期管理者作成

初期管理者はseedではなく`npm run admin:bootstrap`で作成する。正式環境ではSecret Manager等から環境変数を渡し、`ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=true`を明示する。CLIは作成したUserへ`mustChangePassword=true`を設定し、仮パスワードを出力しない。

仮パスワードは十分な長さのランダム値を生成し、電話など本人確認済みの経路または有効期限付きの安全なパスワード共有手段で一度だけ渡す。チャット、メール本文、チケット、作業ログへ記録しない。

## 初回ログイン

1. 仮パスワードでログインする。
2. APIは`mustChangePassword=true`を返し、Webは通常画面ではなく変更画面を表示する。
3. 本人が現在の仮パスワードを再入力し、12～128文字で英大文字・英小文字・数字・記号を含む新しいパスワードへ変更する。
4. 変更はUser更新と`INITIAL_PASSWORD_CHANGED`監査ログを同一transactionで保存する。
5. WebはJWTを破棄し、新しいパスワードでの再ログインを求める。

初回変更状態はJWTへ格納せず、認証済みAPIごとにDBの最新状態を確認する。JWTには失効確認専用の`tokenVersion`だけを含め、DBの値と一致しない旧JWTを401で拒否する。変更前は`/api/me`と変更API以外の認証済み業務APIを403で拒否する。Guard順序はJWT署名検証、User有効性・tokenVersion、初回変更状態、tenant所属、role、subscriptionの順である。

## 失敗時と復旧

入力不一致やポリシー違反は画面の固定メッセージを確認して再入力する。現在の仮パスワードを紛失した場合、DBを直接編集せず、本人確認後に専用のパスワード再発行手順を使用する。現時点では再発行CLIとパスワード再設定メールは未実装のため、正式公開前に運用手順または専用機能を準備する。

パスワード変更transactionで`tokenVersion`を増やすため、仮パスワードで発行されたJWTは直ちに無効になる。Webも保存済みJWTを削除して再ログインを要求する。個別端末単位の失効リストやrefresh tokenは未実装であり、今後より細かなセッション管理が必要な場合は別途追加する。

## Migrationとrollback

`20260728000300_force_initial_password_change`はUserへ`mustChangePassword BOOLEAN NOT NULL DEFAULT false`と`tokenVersion INTEGER NOT NULL DEFAULT 0`を追加する。既存Userはそれぞれfalse、0となる。アプリを旧版へ戻しても追加列は参照されないため、通常は列を残したままロールバックする。列削除はデータを失うため、完全撤去が承認された場合のみバックアップ後に別migrationで行う。
