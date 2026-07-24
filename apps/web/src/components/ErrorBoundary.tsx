import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <ErrorPage code="500" title="画面を表示できませんでした" message="処理を完了できませんでした。時間をおいてもう一度お試しください。" />;
    return this.props.children;
  }
}

export function ErrorPage({ code, title, message }: { code: '404' | '500' | '403'; title: string; message: string }) {
  return <main className="grid min-h-[70vh] place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-2xl border bg-white p-7 text-center shadow-sm"><p className="text-sm font-bold tracking-widest text-emerald-700">ERROR {code}</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><a href="#" className="btn-secondary">トップへ戻る</a>{code === '500' && <button type="button" onClick={() => window.location.reload()} className="btn-primary">再読み込み</button>}</div></section></main>;
}
