import { useEffect, useState } from 'react';
import { api, type Session } from './api/client';
import { AppStatusLayer } from './components/AppStatusLayer';
import { ErrorBoundary, ErrorPage } from './components/ErrorBoundary';
import { LoginPage } from './features/auth/LoginPage';
import { AppFooter } from './features/info/AppFooter';
import { PublicInfoPage, type InfoRoute } from './features/info/PublicInfoPage';
import { SetupGate } from './features/setup/SetupGate';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [infoRoute, setInfoRoute] = useState<InfoRoute | null>(() => routeFromHash());
  const [notFound, setNotFound] = useState(() => isUnknownHash());
  useEffect(() => { const token = sessionStorage.getItem('enshift.accessToken'); if (token) api.me(token).then((data) => setSession({ ...data, accessToken: token })).catch(() => sessionStorage.removeItem('enshift.accessToken')); }, []);
  useEffect(() => { const update = () => { setInfoRoute(routeFromHash()); setNotFound(isUnknownHash()); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const content = notFound
    ? <ErrorPage code="404" title="ページが見つかりません" message="指定されたページは存在しないか、移動した可能性があります。" />
    : infoRoute
    ? <PublicInfoPage route={infoRoute} />
    : !session
      ? <LoginPage onSuccess={(next) => { sessionStorage.setItem('enshift.accessToken', next.accessToken); setSession(next); }} />
      : <SetupGate session={session} onLogout={() => { sessionStorage.removeItem('enshift.accessToken'); setSession(null); }} />;
  return <ErrorBoundary><div className="flex min-h-screen flex-col"><AppStatusLayer /><div className="flex-1">{content}</div><AppFooter /></div></ErrorBoundary>;
}
function isUnknownHash() { return Boolean(window.location.hash.slice(1)) && !routeFromHash(); }

function routeFromHash(): InfoRoute | null {
  const value = window.location.hash.slice(1);
  return ['terms', 'privacy', 'contact', 'support', 'help', 'updates', 'about'].includes(value) ? value as InfoRoute : null;
}
