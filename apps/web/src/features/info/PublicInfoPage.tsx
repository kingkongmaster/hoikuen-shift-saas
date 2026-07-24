import { APP_BUILD, APP_COPYRIGHT, APP_DEVELOPER, APP_LAST_UPDATED, APP_NAME, APP_SUPPORT_EMAIL, APP_VERSION } from '../../app-info';
import { getDeviceInfo } from '../support/device-info';
import { UpdateHistory } from '../support/UpdateHistory';

export type InfoRoute = 'terms' | 'privacy' | 'contact' | 'support' | 'help' | 'updates' | 'about';
const routeTitles: Record<InfoRoute, string> = {
  terms: '利用規約', privacy: 'プライバシーポリシー', contact: 'お問い合わせ', support: 'サポート情報', help: 'ヘルプ', updates: '更新履歴', about: 'アプリ情報',
};
const faq = [
  ['ログインできない', 'メールアドレスとパスワード、通信状態を確認し、解決しない場合は園の管理者へお問い合わせください。'],
  ['パスワードを忘れた', '現在は園の管理者またはサポート窓口へ再設定をご依頼ください。パスワードをお問い合わせ本文へ記載しないでください。'],
  ['希望休を登録したい', '「希望休」から対象月と日付、休暇種類、理由を入力して申請します。承認前であれば編集・取消ができます。'],
  ['自分のシフトを確認したい', '「自分のシフト」から対象月を選択すると、確定済みの勤務を確認できます。'],
  ['通知について知りたい', '「通知」にはシフト確定、希望休の承認・却下、交換申請などが表示されます。未読件数はメニューに表示されます。'],
  ['シフト交換を申請したい', '「シフト交換」から相手と日付を選択します。確定済みシフトがある日だけ申請できます。'],
  ['CSVを出力したい', '管理者・園長は「データ出力」から職員・希望休・シフト・監査ログのCSVを取得できます。'],
  ['印刷したい', 'シフト画面または「データ出力」の「印刷／PDF」ボタンから印刷用画面を開きます。'],
  ['PDFで保存したい', '印刷用画面を開き、ブラウザの印刷先で「PDFとして保存」を選択してください。'],
  ['バックアップを取得したい', '管理者・園長は「データ出力」のJSON Exportを利用できます。認証情報はバックアップへ含まれません。'],
  ['バックアップを確認したい', 'JSON Import後にバックアップ検証と復元プレビューを実行できます。プレビューでは現在のデータは変更されません。'],
  ['改善要望や不具合を報告したい', 'ログイン後の「お問い合わせ」から報告種類を選び、この端末へ保存してください。必要に応じてJSONを書き出して管理者へ共有できます。'],
  ['ホーム画面へ追加したい', '画面下部の「アプリをインストール」、またはiPhoneの共有メニューにある「ホーム画面に追加」を利用してください。'],
] as const;

export function PublicInfoPage({ route }: { route: InfoRoute }) {
  return <main className="min-h-[calc(100vh-89px)] bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6"><div><p className="text-sm font-semibold text-emerald-700">{APP_NAME}</p><h1 className="text-xl font-bold">{routeTitles[route]}</h1></div><a href="#" className="btn-secondary text-sm">戻る</a></div></header>
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      {route === 'terms' && <LegalDocument title="利用規約"><Section title="第1条（適用）">本規約は、EnShiftが提供する園シフト管理サービスの利用条件を定めるものです。本サービスを利用する園および利用者は、本規約に同意したうえで利用します。</Section><Section title="第2条（アカウント管理）">利用者はログイン情報を適切に管理し、第三者による不正利用を防止するものとします。</Section><Section title="第3条（登録情報）">園および利用者は、正確かつ最新の情報を登録し、必要に応じて更新するものとします。</Section><Section title="第4条（禁止事項）">法令に反する行為、他者の権利を侵害する行為、サービス運営を妨げる行為を禁止します。</Section><Section title="第5条（サービスの変更）">保守、安全性向上または機能改善のため、サービス内容を変更する場合があります。</Section></LegalDocument>}
      {route === 'privacy' && <LegalDocument title="プライバシーポリシー"><Section title="1. 取得する情報">アカウント情報、園情報、職員情報、勤務情報、操作履歴など、サービス提供に必要な情報を取得します。</Section><Section title="2. 利用目的">本人確認、シフト管理、希望休管理、通知、サポート、安全性確保およびサービス改善のために利用します。</Section><Section title="3. テナント分離">園のデータはテナント単位で管理し、権限のない他園の利用者からアクセスできないよう制御します。</Section><Section title="4. 安全管理">不正アクセス、紛失、漏えい等を防ぐため、合理的な安全管理措置を講じます。</Section><Section title="5. お問い合わせ">個人情報の取扱いに関するお問い合わせは、お問い合わせ窓口へご連絡ください。</Section></LegalDocument>}
      {route === 'contact' && <ContactPage />}
      {route === 'support' && <SupportPage />}
      {route === 'help' && <article><p className="text-sm font-semibold text-emerald-700">Help</p><h2 className="mt-1 text-2xl font-bold">よくあるご質問</h2><p className="mt-3 text-sm text-slate-600">よく利用する操作とモニター運用時の対応をまとめています。</p><div className="mt-6 space-y-3">{faq.map(([question, answer]) => <details key={question} className="group rounded-xl border bg-white p-4 shadow-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{question}</summary><p className="mt-3 border-t pt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></article>}
      {route === 'updates' && <UpdateHistory />}
      {route === 'about' && <AboutPage />}
    </section>
  </main>;
}

function ContactPage() {
  return <article className="card"><p className="text-sm font-semibold text-emerald-700">Support</p><h2 className="mt-1 text-2xl font-bold">お問い合わせ窓口</h2><p className="mt-3 text-sm leading-6 text-slate-600">ログインできる場合は、管理メニューの「お問い合わせ」から不具合・改善要望・ご意見を端末へ保存できます。ログインできない場合は以下の窓口をご利用ください。</p><dl className="mt-7 grid gap-4 sm:grid-cols-2"><Info label="メールアドレス" value={APP_SUPPORT_EMAIL} /><Info label="受付時間" value="平日 9:00〜17:00（土日祝を除く）" /></dl><div className="message-banner message-warning mt-6">お問い合わせへパスワード、園児の氏名、健康情報などを記載しないでください。</div></article>;
}
function SupportPage() {
  return <article><p className="text-sm font-semibold text-emerald-700">Monitor support</p><h2 className="mt-1 text-2xl font-bold">モニター園サポート情報</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><Info label="通常のお問い合わせ" value={APP_SUPPORT_EMAIL} /><Info label="受付時間" value="平日 9:00〜17:00" /><Info label="不具合報告" value="管理メニュー「お問い合わせ」" /><Info label="改善要望" value="管理メニュー「お問い合わせ」" /></div><section className="card mt-5"><h3 className="font-bold">報告時にご用意いただく情報</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>発生した日時と操作内容</li><li>期待した結果と実際の結果</li><li>画面名、Version、Build番号</li><li>ブラウザと端末情報</li></ul><p className="mt-4 text-sm text-slate-500">ログイン後の報告画面では、画面名・Version・Build・ブラウザ情報を自動付加します。</p></section></article>;
}
function AboutPage() {
  const device = getDeviceInfo();
  return <article className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10"><p className="text-sm font-semibold text-emerald-700">Application</p><h2 className="mt-2 text-4xl font-bold">{APP_NAME}</h2><p className="mt-3 text-slate-600">保育園向けシフト管理システム</p><dl className="mt-8 grid gap-3 text-left sm:grid-cols-2"><Info label="Version" value={APP_VERSION} /><Info label="Build" value={APP_BUILD} /><Info label="最終更新日" value={APP_LAST_UPDATED} /><Info label="開発者" value={APP_DEVELOPER} /><Info label="Browser" value={device.browser} /><Info label="OS / 画面" value={`${device.operatingSystem} / ${device.viewport}`} /><Info label="Copyright" value={APP_COPYRIGHT} /></dl><a href="#updates" className="btn-secondary mt-6">更新履歴を見る</a></article>;
}
function LegalDocument({ title, children }: { title: string; children: React.ReactNode }) {
  return <article><p className="text-sm font-semibold text-emerald-700">EnShift</p><h2 className="mt-1 text-2xl font-bold">{title}</h2><p className="mt-2 text-sm text-slate-500">制定日：2026年7月23日</p><div className="mt-6 max-h-[60vh] space-y-7 overflow-y-auto rounded-2xl border bg-white p-5 leading-7 shadow-sm sm:p-8">{children}<p className="text-sm text-slate-500">※本画面は製品準備用のプレースホルダーです。正式提供前に法務確認済みの内容へ更新します。</p></div></article>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-slate-600">{children}</p></section>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 break-words font-semibold">{value}</dd></div>;
}
