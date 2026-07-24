# 園シフト（EnShift）

保育園・認定こども園向け勤務シフト管理SaaSです。マルチテナント認証基盤、職員マスター、希望休、月間シフト管理を提供します。

開発・レビュー時の判断基準は、[EnShift Developer Philosophy](docs/developer-philosophy.md)を参照してください。

## Sprint 6: 園設定・生成精度向上

園ごとに `TenantShiftSetting`（必要早出・遅出人数、日曜開園、連続勤務上限、標準時間・休憩）、`ClassStaffingRequirement`（0〜5歳児の曜日別必要人数）、`TenantClosedDate`（手動休園日）を持ちます。すべて `tenantId` を必須とし、同一園の設定／日付／クラスだけに一意制約をかけています。既存テナントは最初の設定取得時に安全に初期値を作成します。

| API | 権限 | 内容 |
| --- | --- | --- |
| `GET/PATCH /api/settings/shifts` | ADMIN / DIRECTOR | 園の勤務条件を取得・更新 |
| `GET/PATCH /api/settings/class-requirements` | ADMIN / DIRECTOR | クラス必要人数を取得・一括更新 |
| `GET/POST/PATCH/DELETE /api/closed-dates` | ADMIN / DIRECTOR | 月別休園日の管理 |
| `POST /api/shifts/:id/precheck` | ADMIN | DBを変更しない生成前チェック |
| `POST /api/shifts/:id/generate` | ADMIN | 設定を反映して DRAFT を置換生成 |

初期値は平日・土曜の早出／遅出各2人、日曜休園、最大連続勤務6日、最大連続早出・遅出各1日、早出07:00〜16:00、通常09:00〜18:00、遅出10:30〜20:00、休憩60分です。日曜開園を有効にした場合は土曜の必要人数設定を利用します（設定項目を増やさず、園側で土日用人数を一元管理できるため）。

生成は職員番号で安定ソートする決定論的ルールベースです。承認済み休暇、休園日、日曜休園、勤務可否、月間時間・週勤務日数、最大連続勤務／早出／遅出を順にハード制約として評価し、制約を破って人数を満たしません。クラスは所属担当者、フリー、補助、他クラスの順で日別 `ShiftAssignment.assignedClass` に割り当てます。補完・応援・不足は警告に残します。

警告レベルは `INFO`（休園、フリー・補助補完）、`WARNING`（クラス不足、他クラス応援、時間・週上限、土曜不足）、`ERROR`（早出・遅出不足）です。生成結果には種類別集計 `warningSummary` も返します。seed は2026年8月の休園日、園設定、クラス設定を冪等に追加します。

### Sprint 6の制限事項

- 休園日の削除・変更は物理削除／更新です。確定済みシフトとの整合性確認は次Sprintで追加します。
- `OTHER` は既存の勤務扱い定義に従います。半休の勤務時間詳細、複数クラス兼務、手動セル保護付き部分再生成は未実装です。
- 休園日セルは自動生成でOFFになりますが、緊急保育を想定し手動編集は禁止しません。

## Sprint 7: 通知・シフト交換・監査ログ

Sprint 7では外部サービスを使わないアプリ内通知を追加しました。`Notification` は受信者（`memberId` = ログインユーザーID）ごと、`ShiftSwapRequest` は申請者・相手・日付ごと、`AuditLog` は操作主体と対象をすべて `tenantId` 配下で保持します。

| API | 権限 | 内容 |
| --- | --- | --- |
| `GET /api/notifications` | 全ログイン利用者 | 自分宛の通知のみ取得 |
| `PATCH /api/notifications/:id/read` | 全ログイン利用者 | 自分の通知を既読化 |
| `PATCH /api/notifications/read-all` | 全ログイン利用者 | 自分の未読を全件既読化 |
| `GET/POST /api/shift-swaps` | 全ログイン利用者 | 自分の交換申請。管理者・園長は園全体を閲覧 |
| `PATCH /api/shift-swaps/:id` | ADMIN / DIRECTOR | 承認・却下。承認時は確定済み両者の勤務明細を交換 |
| `DELETE /api/shift-swaps/:id` | 申請者本人 | PENDING の申請を取消 |
| `GET /api/audit-logs` | ADMIN / DIRECTOR | 期間・操作・職員で絞込み可能な監査ログ |

通知は希望休の承認・却下、シフト確定・手動更新・自動生成、交換申請・承認・却下で作成されます。監査ログは職員、希望休、シフト編集・生成・確定、交換、園設定の更新を記録します。メール、Push、Firebase、外部 API は利用しません。

### Sprint 7の制限事項

- 交換対象は同日・確定済みで、双方に職員レコードと勤務明細がある場合に限ります。
- 交換は勤務区分・勤務時間・休憩・備考・配置クラスを丸ごと入れ替えます。再配置最適化や多人数交換は未実装です。
- 通知はアプリ内のみで、メール・Push配信や既読期限は未実装です。

## 構成

```text
apps/
  web/                         React + TypeScript + Tailwind CSS
  api/
    src/
      domain/                  ドメインモデル・ルールの配置予定
      application/             ユースケースの配置予定
      infrastructure/database/ PostgreSQL接続
      presentation/health/     ヘルスチェック
      presentation/staff/      職員マスターAPI
      presentation/requests/   希望休API
      presentation/shifts/     月間シフトAPI
docker-compose.yml             PostgreSQL / API / Nginx付きWeb
```

テナント境界はすべての業務テーブルに`tenantId`を持たせ、JWTとDB上のmembershipから解決します。リクエストで任意の園IDを信用しません。

## 実装済み機能

- JWTログインと園ごとのロール（管理者・園長・主任・一般職員）
- membershipを再検証するテナントアクセス制御
- 管理者向け職員一覧・登録・編集・無効化
- 無効な職員を含む一覧表示切替
- PC表／スマートフォンカードのレスポンシブ管理画面
- 職員による希望休の申請・編集・取消
- 管理者・園長による月別確認・職員絞込み・承認・却下・コメント
- 状態色分けされた月カレンダー
- 管理者・園長による月間シフトの作成、手動編集、一括保存、確定、下書きへの差戻し
- 主任・一般職員による確定済み本人シフトの閲覧
- 希望休・職員勤務条件（早出・遅出・土曜・月間概算時間・週勤務日数）の警告
- 管理者によるルールベース月間シフト自動生成（Sprint 5）

## 月間シフト（Sprint 4）

`MonthlyShift`は園（`tenantId`）と対象月（月初日）で一意な親レコードです。状態は`DRAFT`または`CONFIRMED`です。`ShiftAssignment`は職員・日付ごとの明細で、`monthlyShiftId`・`staffId`・`workDate`の組を一意にします。作成時には全日付の空明細を作らず、編集されたセルだけを保存するため、月ごとの不要なレコードを抑えます。

勤務区分は`EARLY`（7:00〜16:00）、`NORMAL`（9:00〜18:00）、`LATE`（10:30〜20:00）、`OFF`、`PAID_LEAVE`、`SUMMER_LEAVE`、`AM_HALF`、`PM_HALF`、`OTHER`です。前3種は標準時刻を補助入力します。月間時間は、開始・終了・休憩からの概算で警告し、週の開始曜日は月曜日です。

| API | 権限 | 内容 |
| --- | --- | --- |
| `GET /api/shifts?month=YYYY-MM` | 全ログインユーザー | 管理者・園長は園全体、主任・一般職員は確定済み本人分 |
| `GET /api/shifts/:id` | 全ログインユーザー | 同上。別園・未公開の下書きは404 |
| `POST /api/shifts` | 管理者・園長 | 月間下書きを作成（同月は409） |
| `PUT /api/shifts/:id/assignments` | 管理者・園長 | 明細をトランザクションで一括保存 |
| `POST /api/shifts/:id/confirm` | 管理者・園長 | 確定。承認済み希望休と勤務の競合は409 |
| `POST /api/shifts/:id/reopen` | 管理者・園長 | 確定済みを下書きへ戻す |

通常保存では勤務条件や申請中希望休を警告として返します。承認済み希望休に勤務を割り当てた場合は確定を停止します。確定後は編集不可で、先に下書きへ戻す必要があります。

## ルールベース自動生成（Sprint 5）

`POST /api/shifts/:id/generate`は管理者のみが実行できます。対象は`DRAFT`の月間シフトだけで、対象月の明細を生成結果で置き換えます。生成後も`DRAFT`のため、管理者は月間表で自由に手動修正できます。乱数・AI・外部ライブラリは使いません。

候補は職員番号で安定ソートし、次の優先順で決定します。

1. 承認済み希望休を勤務不可として反映（有給・夏季休暇・半休を含む）
2. 勤務区分可否、土曜日勤務可否、早出／遅出専任
3. 月間勤務時間上限と週勤務可能日数
4. 前日の早出／遅出と同じ区分を避ける
5. 累積勤務数、土曜勤務数が少ない職員を優先
6. 職員番号での安定した同点解決

平日・土曜は早出2人、遅出2人を目標にし、残る正職員には通常勤務を割り当てます。日曜は原則OFFです。0歳児は3人、1〜5歳児は各2人を目標に人数を確認します。不足しても生成は停止せず、警告を返します。

主な生成警告は、`CLASS_SHORTAGE`、`EARLY_SHORTAGE`、`LATE_SHORTAGE`、`SATURDAY_SHORTAGE`、`MONTHLY_HOURS_LIMIT`、`WEEKLY_DAYS_LIMIT`です。希望休は強制的に休暇として反映するため、生成時に勤務との競合は作りません。

開発seedは2026年8月の下書き、明細、希望休を冪等に作成します。承認済み有給と通常勤務の競合例を含むため、警告UIを確認できます。

## 起動

1. `.env.example`を`.env`へコピーし、`POSTGRES_PASSWORD`を変更します。
2. Docker Desktopが利用できる環境で実行します。

```bash
docker compose up --build
```

ブラウザで `http://localhost:8080`、APIヘルスチェックは `http://localhost:8080/api/health` です。

## GitHub Codespacesでの起動

Codespaceを作成すると、`.devcontainer/devcontainer.json`によりDockerを利用できる開発環境とAPI・Webの依存パッケージが準備されます。公開するポートはNginxのWebポート`8080`だけです。APIとPostgreSQLはDockerネットワーク内に留まり、Nginxが`/api`をAPIコンテナへプロキシします。

1. Codespaceのターミナルで環境変数ファイルを作成します。

   ```bash
   cp .env.example .env
   ```

2. `.env`の`POSTGRES_PASSWORD`、`DATABASE_URL`、`JWT_SECRET`、`SEED_OWNER_PASSWORD`を開発用の十分に強い値へ変更します。`.env`はGit管理対象外です。
3. コンテナを起動します。

   ```bash
   docker compose up --build -d
   docker compose ps
   curl --fail http://localhost:8080/api/health
   ```

4. Codespacesの「ポート」画面で`8080`を開きます。初期公開範囲は`Private`です。APIの`3000`とPostgreSQLの`5432`は転送・公開しないでください。

スマートフォンなど、Codespace外の端末で一時確認する場合に限り、ポート`8080`を右クリックして「ポートの可視性」から`Public`へ手動変更します。確認終了後は同じ操作で必ず`Private`へ戻し、不要になったコンテナは次のコマンドで停止します。

```bash
docker compose down
```

Codespaceを停止または削除する前に、「ポート」画面で`8080`が`Private`へ戻っていることを確認してください。

## Dockerなしの開発確認

```bash
# terminal 1
cd apps/api
cp .env.example .env
npm run start:dev

# terminal 2
cd apps/web
npm run dev
```

PostgreSQLがない場合はAPI側の`.env`で`DATABASE_CONNECT_ON_STARTUP=false`にすると、画面・APIの起動のみ確認できます。

## API統合テスト

Docker環境のAPI・Web・PostgreSQLが起動している状態で実行します。

```bash
docker compose --profile test run --rm --build api-test
```

テスト用のユーザー・園・職員は実行中だけ作成され、終了時に削除されます。

個別に実行する場合は、APIコンテナが起動した状態で以下を使用します。

```bash
cd apps/api
npm run test:sprint2
npm run test:sprint3
npm run test:sprint4
npm run test:sprint5
npm run test:sprint6
npm run test:sprint7
npm run test:sprint8
```

## 現時点の制限事項

- 自動シフト生成、交換申請、通知、給与・勤怠計算は未実装です。
- 祝日データの外部連携は行いません。
- 勤務時間上限は、明細の開始・終了・休憩から求める概算警告です。
- 勤務条件違反の多くは、管理者が判断できる警告であり保存を一律には禁止しません。
- 自動生成は配置目標を満たす保証はなく、不足時は警告を返すVersion 1です。職員ごとの詳細な希望勤務、複数クラス兼務、祝日、連続勤務の高度な最適化は未実装です。

## 次の実装候補

- 認証のOAuth/OIDCへの差替え
- 自動シフト生成
- 監査ログ、権限、テスト、CI/CD

## データ出力・バックアップ（Sprint 8）

管理者・園長は「データ出力」から月間シフト、職員一覧、希望休、監査ログをCSVで取得できます。CSVはUTF-8 BOM付きで、カンマ・改行・二重引用符をエスケープし、`=`, `+`, `-`, `@`で始まる値にはシングルクォートを付けてCSVインジェクションを防ぎます。CSVにメールアドレスや認証情報は含めません。

| API | 権限 | 内容 |
| --- | --- | --- |
| `GET /api/exports/shifts.csv?month=YYYY-MM` | 管理者・園長 | 日別・職員別の月間シフトCSV |
| `GET /api/exports/staff.csv` | 管理者・園長 | 職員一覧CSV（無効職員を含む） |
| `GET /api/exports/shift-requests.csv?month=YYYY-MM` | 管理者・園長 | 希望休一覧CSV |
| `GET /api/exports/audit.csv` | 管理者・園長 | 監査ログCSV |
| `GET /api/exports/print/shifts?month=YYYY-MM` | 管理者・園長 | 園全体の印刷データ |
| `GET /api/exports/print/my-shift?month=YYYY-MM` | ログインユーザー | 本人分のみ。確定済みシフトのみ |
| `POST /api/backups/export` | 管理者・園長 | テナント単位バックアップJSONのダウンロード |
| `POST /api/backups/validate` | 管理者・園長 | JSONの形式・件数・checksum・tenantIdを検証 |
| `POST /api/backups/preview-restore` | 管理者・園長 | 同一tenantIdの追加・更新・欠落候補を表示（書込みなし） |

印刷はブラウザの印刷ダイアログを利用し、A4横向きと「PDFとして保存」に対応します。一般職員は園全体CSV・バックアップ・復元プレビューを利用できず、確定済みの本人シフトだけを印刷できます。

バックアップ形式は`enshift-backup` version 1です。tenant metadata、members（パスワードハッシュなし）、staff、希望休、月間シフト・明細、園設定、クラス必要人数、休園日、通知、交換申請、監査ログを含みます。パスワードハッシュ、JWT、セッション、APIキー、環境変数、接続情報は含めません。`data`をキー順で安定シリアライズし、SHA-256 checksumを記録します。checksumは破損検知であり、電子署名・改ざん防止の保証ではありません。

JSONアップロードは10MB以下です。危険なキー（`__proto__`、`prototype`、`constructor`）、不正JSON、非対応version、checksum不一致、件数不一致、別tenantIdを拒否します。検証・復元プレビューは監査ログだけを記録し、業務データを書き換えません。本復元、差分復元、自動ロールバック、外部ストレージ連携は未実装です。
