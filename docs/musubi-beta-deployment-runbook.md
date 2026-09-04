# むすび保育園 Beta 配備・ロールバック手順

## 1. 境界

本手順は人間が承認後に実行する。`compose.musubi-beta.yaml`は、Web/APIを既存の`aen-shift-postgres`へ接続する追加構成であり、既存PostgreSQL Compose、volume、03:00 JSTバックアップを変更しない。

通常API起動はmigration（DB構造更新）やseed（デモデータ投入）を実行しない。VPS上でbuildせず、CIまたは管理されたbuild端末で作った変更不能なimage tag/digestを指定する。

## 2. 人間が事前に確認する値

値は画面共有、作業ログ、コマンド履歴へ表示しない。

- `AEN_SHIFT_DOMAIN`, `ACME_EMAIL`
- `AEN_SHIFT_API_IMAGE`, `AEN_SHIFT_WEB_IMAGE`, `AEN_SHIFT_MIGRATION_IMAGE`
- `POSTGRES_DOCKER_NETWORK`: `aen-shift-postgres`が参加済みのDocker network名
- `DATABASE_URL`: 内部ホスト名を`aen-shift-postgres`、DB/userを`aen_shift`とする接続URL
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `DATABASE_TARGET_ID`, `CONFIRM_DATABASE_TARGET_ID`

Composeの`.env`読込み先は`/opt/aen-shift/.env`を使えるが、既存キーを上書きする前にrootでバックアップし、所有者`root:root`・mode `600`を維持する。

## 3. 既存PostgreSQLとの統合

1. `docker inspect`でPostgreSQLが参加するnetwork名だけを確認する。環境変数やpasswordは表示しない。
2. `POSTGRES_DOCKER_NETWORK`へそのnetwork名を指定する。
3. `aen-shift-postgres`の5432はpublishしない。
4. Beta Composeはexternal networkへ参加し、APIと一回限りのmigrationだけがDBへ接続する。
5. edge以外にhost portを割り当てない。

## 4. HTTPS

Caddy（証明書取得とHTTPS中継を行うWebサーバー）が80を443へ転送し、443から内部Webへ中継する。正式DNSのA/AAAAレコードをVPSへ向け、80/443だけを許可してから起動する。APIの`WEB_ORIGIN`は`https://<domain>`、`TRUST_PROXY=1`でCaddy→Web Nginx→APIのうちAPIが直接信頼する直前のproxyを1hopとして扱う。

確認項目：

- HTTP URLがHTTPSへ恒久転送される。
- 証明書のhostname、有効期限、chainが正常。
- `/api/health`と`/api/ready`がWeb経由で成功。
- API 3000とPostgreSQL 5432へ外部から接続できない。
- HSTS、CSP、frame拒否、MIME推測拒否headerが付く。

## 5. migration checklist

1. 直前`pg_dump`を取得し、`pg_restore -l`で読めることを確認。
2. image digest、Git commit、DB targetを記録。
3. operations profileのmigration imageで`status`。
4. `node scripts/migration.cjs deploy --dry-run`。これはSQL試行ではなくstatus確認である。
5. 人が対象を再確認後だけ`ALLOW_PRODUCTION_MIGRATION=true`で`deploy`。
6. 再度`status`、API `/api/ready`、主要APIを確認。
7. seed、匿名fixture、`prisma migrate dev`は使用禁止。

## 6. Tenant・管理者・importer checklist

1. `admin:bootstrap`を`INITIAL_ADMIN_STAFF_MODE=deferred-link`、23名中の`INITIAL_ADMIN_EMPLOYEE_NUMBER`付きで実行する。UserとMembershipだけを作り、ダミーStaffを作らない。
2. Git外packageを`import:musubi-beta`へ渡し、まず引数なしのdry-runを保存する。ログに氏名は出ない。
3. 新規/更新、23/20/3、管理者リンク、Tenant IDを二者確認。
4. productionでは`ALLOW_PRODUCTION_MUSUBI_IMPORT=true`、`CONFIRM_MUSUBI_TENANT_ID`、`CONFIRM_MUSUBI_STAFF_COUNT=23`を一回限りで設定して`--apply`。
5. 同じpackageで`--verify`し、23/20/3、ログイン紐付け1名がPASSすることを確認。
6. importerが自動登録するのは職員基本情報、部署、生成対象区分、管理者リンクまで。希望休・有給・半休・早退・固定勤務・個別ルールは、承認済みGit外原本から既存画面/APIで登録し、原本との件数・日付を二者照合する。未確定値を入力しない。
7. packageはVPSへ残さず、承認済みの安全な保管場所へ戻す。

## 7. Beta acceptance checklist

- [ ] 管理者初回password変更と再ログイン
- [ ] 職員23名、生成20名、給食室3名表示のみ
- [ ] 希望休・有給・半休・早退・固定条件の件数二者照合
- [ ] 2026年9月生成前チェック
- [ ] 生成結果のERROR/WARNING/INFO確認
- [ ] 手修正、保存、再読込、確定
- [ ] 全職員印刷/PDFと個人カレンダー
- [ ] 390px幅スマホ表示
- [ ] 別TenantのIDで越境不可
- [ ] JSON/通知/交換/契約/匿名デモ等がBeta menuにない
- [ ] DB backup取得と隔離環境でのrestore確認
- [ ] 園の試用終了・問い合わせ・password reset窓口を合意

## 8. password reset手動手順

自動メール再設定は未実装。本人確認済みの園管理者だけが職員管理画面から一時passwordを設定し、理由を記録する。口頭・別経路で本人へ渡し、初回ログイン時に本人が変更する。管理者自身が入れない場合は、運用責任者がDBを直接編集せず、承認済みone-off reset手順を別途実行する。それまでは管理者アカウントを最低2名へ増やさない。

## 9. backup/restore

日次`pg_dump`を正とする。アプリJSONは補助的なexportと検証・previewだけで、本復元機能ではない。復旧時は新しい隔離PostgreSQL 16へbackupをrestoreし、migration status、23/20/3、ログイン、9月シフトを確認してから切替判断する。本番DBへ上書きrestoreしない。

## 10. rollback

- image不具合：DB migration互換性を確認し、直前のimmutable image digestへ戻す。
- migration不具合：書込みを止め、新しい隔離DBへ直前backupをrestoreする。migration SQLを手作業で逆実行しない。
- import不具合：transaction失敗なら自動rollback。commit後の誤データは直接修正せず、直前backupへ戻すか、承認済み修正packageを再dry-runする。
- HTTPS不具合：HTTPへ降格せず公開を停止する。

## 11. ConoHa 2GB監視

Compose上限はedge 96MB、Web 96MB、API 384MB、一回限りmigration 512MB。PostgreSQLとOSのため約900MB以上を残す。`docker stats --no-stream`、`free -h`、`df -h`、`docker system df`で確認し、`docker inspect`のOOMKilledとsystem journalのOOM記録を確認する。秘密を含むenvironment全体はinspect出力しない。

swapは勝手に変更しない。人の承認がある場合に1〜2GBを候補とし、暗号化されないswapへ秘密が退避され得る点、SSD書込み、性能低下を承認してから設定する。swapはメモリ不足の解決ではなく、急なOOMを遅らせる安全余裕である。

## 12. Known limitations

- 自動生成Version 1は必要人数充足を保証せず、警告後に人が確認・修正する。
- ②希望優先、S005/S010⑤一般条件、第3金曜会議は正式回答がなければ自動条件へ入れない。
- PDFはサーバー生成ではなくブラウザの「PDFとして保存」。
- PWAは画面shellをcacheするが、オフラインで業務データの閲覧・編集はできない。
- password resetメール、Push通知、完全なJSON restoreは未実装。
