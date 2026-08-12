# プレゼン前 Preflight Check

プレゼン前に、デモ環境が空DBや誤った接続先を使っていないことを確認します。本番環境では実行しません。

## 実行方法

Web、API、ローカルデモDBを起動し、APIの環境変数を読み込んだ状態で実行します。

```bash
cd apps/api
npm run demo:preflight
```

次の9項目がすべて`PASS`であることを確認します。

1. `DATABASE_URL`がローカルのデモDBを指している
2. Prisma Migrationがすべて適用済み
3. Demo Seedが適用済み
4. `User`テーブルが存在する
5. デモ管理者でログインできる
6. 一般職員デモでログインできる
7. `/api/health`がHTTP 200を返す
8. `/api/ready`がHTTP 200を返す
9. `git status`がcleanである

全項目がPASSの場合、最終行に`Presentation Ready`と表示します。1件でもFAILがある場合は、FAIL項目の一覧に続けて`Presentation NOT Ready`と表示します。この総合判定だけを見てプレゼン開始可否を判断します。

デモユーザーは個別のメールアドレスを維持し、開発・デモ環境のパスワードだけを共通値に統一します。seedとPreflight Checkはproduction環境での実行を拒否します。

## Ready警告の調査結果

実現可能です。ただし、現在の`/api/ready`は本番を含むサービス稼働確認であり、デモユーザーを必須にすると本番データへデモアカウントを要求してしまいます。

将来追加する場合は、`DEMO_PREFLIGHT_REQUIRED=true`を明示した開発・プレゼン環境だけで、起動時または`/api/ready`にデモTenantと必須ユーザーの存在確認を追加します。通常環境とproductionでは無効にし、今回追加したPreflight Checkをプレゼン前の標準手順とします。
