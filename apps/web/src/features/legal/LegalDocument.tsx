import { useRef, useState } from 'react';
import type { SetupState } from '../../api/client';
import { LEGAL_DOCUMENTS } from './legal-documents';
type Kind = 'terms' | 'privacy';
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800';
export function legalConsentAvailable(setup: SetupState) {
  return Boolean(LEGAL_DOCUMENTS.release.approved && setup.legalRelease?.approved && setup.legalRelease.effectiveDate && setup.legalRelease.effectiveDate === LEGAL_DOCUMENTS.release.effectiveDate && setup.currentTermsVersion === LEGAL_DOCUMENTS.terms.version && setup.currentPrivacyVersion === LEGAL_DOCUMENTS.privacy.version && setup.legalRelease.termsHash === LEGAL_DOCUMENTS.terms.contentHash && setup.legalRelease.privacyHash === LEGAL_DOCUMENTS.privacy.contentHash);
}
export function LegalDocument({ kind }: { kind: Kind }) {
  const doc = LEGAL_DOCUMENTS[kind];
  return <article className="break-words bg-white text-base leading-8 text-slate-800" aria-label={`${doc.title}全文`}>
    <h2 className="text-2xl font-bold">{doc.title}</h2>
    <p className="mt-2">版：{doc.version}</p>
    <p>施行日：{LEGAL_DOCUMENTS.release.effectiveDate ?? '未設定（人間確認待ち）'}</p>
    {!LEGAL_DOCUMENTS.release.approved && <p role="note" className="my-4 rounded-lg border border-amber-700 bg-amber-50 p-3 text-amber-950">正式版候補・未承認・未施行。まだ法的同意を取得しません。「要確認」の項目は承認前に確定します。</p>}
    {doc.sections.map(s => <section className="mt-6" key={s.heading}><h3 className="text-lg font-bold">{s.heading}</h3><p className="mt-2 whitespace-pre-line">{s.text}</p></section>)}
    <p className="mt-8 border-t pt-4">{LEGAL_DOCUMENTS.release.copyright}</p>
  </article>;
}
function DocumentReader({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const doc = LEGAL_DOCUMENTS[kind];
  return <div>
    <button ref={opener} type="button" onClick={() => { ref.current?.showModal(); ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); }} className={`min-h-12 rounded px-2 text-left font-semibold text-emerald-800 underline underline-offset-4 ${focus}`}>{doc.title}全文を読む</button>
    <dialog ref={ref} onClose={() => opener.current?.focus()} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }} aria-label={`${doc.title}全文`} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-slate-300 p-5 backdrop:bg-black/60">
      <form method="dialog" className="sticky top-0 z-10 flex justify-end bg-white pb-3"><button autoFocus className={`min-h-12 rounded-lg border border-slate-500 bg-white px-4 font-semibold ${focus}`}>同意画面へ戻る</button></form>
      <LegalDocument kind={kind} />
      <form method="dialog" className="mt-6"><button className={`min-h-12 w-full rounded-lg border border-slate-500 px-4 font-semibold ${focus}`}>同意画面へ戻る</button></form>
    </dialog>
  </div>;
}
export function LegalConsent({ setup, setAccepted }: { setup: SetupState; accepted: boolean; setAccepted: (value: boolean) => void }) {
  const ready = legalConsentAvailable(setup);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  if (setup.legalConsentVerified && ready) return <section aria-label="利用条件の確認"><h2 className="text-2xl font-bold">利用規約・プライバシーポリシー 同意済み</h2><p>現在の文書と既存の本人同意が一致しています。再同意は不要です。</p><DocumentReader kind="terms" /><DocumentReader kind="privacy" /></section>;
  if (setup.legalConsentStatus === 'EVIDENCE_MISMATCH') return <section aria-label="利用条件の確認"><h2 className="text-2xl font-bold">利用規約</h2><p role="alert">既存の同意証跡を確認できません。再同意せず運営窓口へご確認ください。</p><DocumentReader kind="terms" /><DocumentReader kind="privacy" /></section>;
  return <section aria-label="利用条件の確認"><h2 className="text-2xl font-bold">利用規約</h2><p className="mt-3 text-base leading-7">全文を確認し、施設を代表して同意する権限があることをご確認ください。職員本人への必要な説明や同意を代替するものではありません。</p>
    <div className="mt-5 grid gap-4"><DocumentReader kind="terms" /><DocumentReader kind="privacy" /></div>
    {!ready && <p role="alert" className="mt-4 rounded border border-amber-700 bg-amber-50 p-3 text-amber-950">正式文面の承認待ち、または表示文書とサーバーの版が一致しません。同意せず運営窓口へご確認ください。</p>}
    <div className="mt-6 space-y-3">{(['terms', 'privacy'] as const).map(kind => <label key={kind} className="flex min-h-14 items-start gap-3 rounded-xl border-2 border-emerald-800 p-4 text-base font-semibold"><input type="checkbox" className={`mt-1 size-5 shrink-0 accent-emerald-800 ${focus}`} disabled={!ready} checked={ready && (kind === 'terms' ? terms : privacy)} onChange={e => { const value = e.target.checked; if (kind === 'terms') { setTerms(value); setAccepted(value && privacy); } else { setPrivacy(value); setAccepted(terms && value); } }} />{kind === 'terms' ? '利用規約' : 'プライバシーポリシー'}の全文を確認し、同意する</label>)}</div>

  </section>;
}
