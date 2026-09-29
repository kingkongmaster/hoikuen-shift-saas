import { useEffect, useState } from 'react';

export function AppStatusLayer() {
  const [active, setActive] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState('');
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    const ready = (event: Event) => setUpdate((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('enshift:pwa-update', ready);
    return () => window.removeEventListener('enshift:pwa-update', ready);
  }, []);
  function activateUpdate() {
    if (!update?.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    update.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  }
  useEffect(() => {
    const start = () => setActive((value) => value + 1);
    const end = () => setActive((value) => Math.max(0, value - 1));
    const showError = (event: Event) => setToast((event as CustomEvent<{ message: string }>).detail.message);
    const clearError = () => setToast('');
    const onOnline = () => { setOnline(true); setToast('通信が回復しました。いつもどおりご利用いただけます。'); };
    const onOffline = () => setOnline(false);
    window.addEventListener('enshift:api-start', start);
    window.addEventListener('enshift:api-end', end);
    window.addEventListener('enshift:api-error', showError);
    window.addEventListener('enshift:clear-error', clearError);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('enshift:api-start', start);
      window.removeEventListener('enshift:api-end', end);
      window.removeEventListener('enshift:api-error', showError);
      window.removeEventListener('enshift:clear-error', clearError);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return <>
    {update && <div role="status" className="border-b bg-white p-3 text-sm text-[var(--ink)]"><p>新しいバージョンがあります。入力中の内容を保存してから更新してください。</p><button type="button" className="btn-primary mt-2" onClick={activateUpdate}>保存済み・更新する</button></div>}
    {active > 0 && <div role="progressbar" aria-label="通信中" className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-emerald-100"><span className="block h-full w-1/2 animate-pulse rounded-r-full bg-emerald-600" /></div>}
    {!online && <div role="alert" className="connection-banner"><strong>現在オフラインです。</strong> 入力内容はそのままにして、通信の回復をお待ちください。</div>}
    {toast && <div role="status" aria-live="polite" className="app-toast"><span className="action-symbol bg-white/15" aria-hidden="true">案</span><span className="min-w-0 flex-1">{toast}</span><button type="button" onClick={() => setToast('')} aria-label="メッセージを閉じる" className="btn-quiet shrink-0 text-white hover:bg-white/10 hover:text-white">閉じる</button></div>}
  </>;
}
