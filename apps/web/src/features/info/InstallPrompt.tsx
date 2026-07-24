import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const installedEvent = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installedEvent);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installedEvent); };
  }, []);
  if (installed) return null;
  if (prompt) return <button type="button" onClick={() => { void prompt.prompt().then(() => prompt.userChoice).then((choice) => { if (choice.outcome === 'accepted') setPrompt(null); }); }} className="min-h-11 rounded-lg border border-slate-600 px-3 text-slate-100 hover:border-slate-300">アプリをインストール</button>;
  if (isiOS) return <span className="max-w-xs text-center text-xs text-slate-400 md:text-right">iPhone/iPad：Safariの共有から「ホーム画面に追加」</span>;
  return null;
}
