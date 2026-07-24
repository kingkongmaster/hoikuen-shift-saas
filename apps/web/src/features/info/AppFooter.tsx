import { APP_VERSION } from '../../app-info';
import { InstallPrompt } from './InstallPrompt';

const links = [
  { href: '#terms', label: '利用規約' },
  { href: '#privacy', label: 'プライバシーポリシー' },
  { href: '#contact', label: 'お問い合わせ' },
  { href: '#support', label: 'サポート情報' },
  { href: '#help', label: 'ヘルプ' },
  { href: '#updates', label: '更新履歴' },
];

export function AppFooter() {
  return <footer className="border-t border-emerald-950/20 bg-[var(--brand-deep)] text-emerald-50/85">
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm sm:px-6 md:flex-row">
      <nav aria-label="サポートメニュー" className="flex flex-wrap justify-center gap-x-5 gap-y-3">
        {links.map((link) => <a key={link.href} href={link.href} className="min-h-11 content-center rounded-lg px-1 hover:text-white hover:underline">{link.label}</a>)}
      </nav>
      <div className="flex flex-col items-center gap-2 md:items-end"><InstallPrompt /><a href="#about" aria-label={`アプリ情報 Version ${APP_VERSION}`} className="min-h-11 content-center whitespace-nowrap font-bold text-white hover:underline">Version {APP_VERSION}</a></div>
    </div>
  </footer>;
}
