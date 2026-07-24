import { APP_BUILD, APP_LAST_UPDATED, APP_VERSION } from '../../app-info';

export const RELEASES = [
  {
    version: APP_VERSION,
    build: APP_BUILD,
    date: APP_LAST_UPDATED,
    title: 'モニター園向け Release Candidate 1',
    changes: ['初回のようこそ画面と3画面のかんたんガイドを追加', '管理者・一般職員それぞれのホームを改善', '文言、空表示、読み込み、オフライン表示を先生に優しい形へ改善'],
  },
  {
    version: 'Sprint 10-B',
    build: '20260723.10B',
    date: '2026-07-23',
    title: 'モニター園運用支援',
    changes: ['お問い合わせ・改善要望・不具合報告・ご意見・アプリ評価を追加', '更新履歴、端末情報、サポート情報を追加', 'FAQをモニター運用向けに拡充'],
  },
  {
    version: 'Sprint 10-A',
    build: 'monitor-preview',
    date: '2026-07-23',
    title: 'モニター園向けテスト版',
    changes: ['PWA・ホーム画面追加対応', '通知、バックアップ、PDF・CSV出力を改善', '共通ローディング・空表示・エラー表示を整備'],
  },
  {
    version: 'Sprint 9-C',
    build: 'contract-ready',
    date: '2026-07-23',
    title: '契約・初期設定仕上げ',
    changes: ['契約情報、利用規約、プライバシーポリシーを追加', 'ヘルプ、アプリ情報、共通フッターを追加'],
  },
] as const;

export function UpdateHistory() {
  return <section>
    <p className="text-sm font-semibold text-emerald-700">Release notes</p>
    <h2 className="mt-1 text-2xl font-bold">更新履歴</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">今後の改善内容も同じ形式で追加します。</p>
    <ol className="mt-6 space-y-4">
      {RELEASES.map((release, index) => <li key={`${release.version}-${release.build}`} className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{index === 0 ? 'Latest' : 'Release'}</p><h3 className="mt-1 text-lg font-bold">{release.version} — {release.title}</h3></div>
          <div className="text-right text-xs text-slate-500"><p>{release.date}</p><p>Build {release.build}</p></div>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </li>)}
    </ol>
  </section>;
}
