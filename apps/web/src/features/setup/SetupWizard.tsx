import { useMemo, useState } from 'react';
import {
  api,
  type AssignedClass,
  type ClassRequirement,
  type Session,
  type SetupState,
  type ShiftSetting,
} from '../../api/client';
import { moveSetupStep, resumeSetupStep, validateSetupStep } from './setup-wizard-state.js';

const steps = ['園情報', '勤務設定', 'クラス設定', '利用規約', '完了'];
const classes: Array<{ classType: AssignedClass; label: string }> = [
  { classType: 'AGE_0', label: '0歳' },
  { classType: 'AGE_1', label: '1歳' },
  { classType: 'AGE_2', label: '2歳' },
  { classType: 'AGE_3', label: '3歳' },
  { classType: 'AGE_4', label: '4歳' },
  { classType: 'AGE_5', label: '5歳' },
  { classType: 'FREE', label: 'フリー' },
];
const defaultSettings: ShiftSetting = {
  weekdayEarlyRequired: 2,
  weekdayLateRequired: 2,
  saturdayEarlyRequired: 2,
  saturdayLateRequired: 2,
  saturdayMinimumStaff: 3,
  saturdayOperationEnabled: true,
  sundayOperationEnabled: false,
  directorCountsTowardStaffing: false,
  directorClassPlacementMode: 'NONE',
  maxConsecutiveWorkDays: 6,
  maxConsecutiveEarlyDays: 1,
  maxConsecutiveLateDays: 1,
  defaultStartEarly: '07:00',
  defaultEndEarly: '16:00',
  defaultStartNormal: '08:30',
  defaultEndNormal: '17:00',
  defaultStartLate: '11:00',
  defaultEndLate: '19:30',
  defaultBreakMinutes: 60,
};

type TenantDraft = {
  name: string;
  postalCode: string;
  addressLine: string;
  phone: string;
  contactEmail: string;
  directorName: string;
};
type RequirementDraft = Pick<ClassRequirement, 'classType' | 'weekdayRequired' | 'saturdayRequired' | 'isActive'>;
type Draft = {
  tenant: TenantDraft;
  workSettings: ShiftSetting;
  saturdayCareEnabled: boolean;
  classRequirements: RequirementDraft[];
  accepted: boolean;
};
function createDraft(setup: SetupState): Draft {
  const requirementMap = new Map(setup.classRequirements.map((row) => [row.classType, row]));
  const settings = setup.shiftSettings
    ? {
        weekdayEarlyRequired: setup.shiftSettings.weekdayEarlyRequired,
        weekdayLateRequired: setup.shiftSettings.weekdayLateRequired,
        saturdayEarlyRequired: setup.shiftSettings.saturdayEarlyRequired,
        saturdayLateRequired: setup.shiftSettings.saturdayLateRequired,
        saturdayMinimumStaff: setup.shiftSettings.saturdayMinimumStaff,
        saturdayOperationEnabled: setup.shiftSettings.saturdayOperationEnabled,
        sundayOperationEnabled: setup.shiftSettings.sundayOperationEnabled,
        directorCountsTowardStaffing: setup.shiftSettings.directorCountsTowardStaffing,
        directorClassPlacementMode: setup.shiftSettings.directorClassPlacementMode,
        maxConsecutiveWorkDays: setup.shiftSettings.maxConsecutiveWorkDays,
        maxConsecutiveEarlyDays: setup.shiftSettings.maxConsecutiveEarlyDays,
        maxConsecutiveLateDays: setup.shiftSettings.maxConsecutiveLateDays,
        defaultStartEarly: setup.shiftSettings.defaultStartEarly,
        defaultEndEarly: setup.shiftSettings.defaultEndEarly,
        defaultStartNormal: setup.shiftSettings.defaultStartNormal,
        defaultEndNormal: setup.shiftSettings.defaultEndNormal,
        defaultStartLate: setup.shiftSettings.defaultStartLate,
        defaultEndLate: setup.shiftSettings.defaultEndLate,
        defaultBreakMinutes: setup.shiftSettings.defaultBreakMinutes,
      }
    : defaultSettings;
  return {
    tenant: {
      name: setup.name ?? '',
      postalCode: setup.postalCode ?? '',
      addressLine: [setup.prefecture, setup.city, setup.addressLine].filter(Boolean).join(''),
      phone: setup.phone ?? '',
      contactEmail: setup.contactEmail ?? '',
      directorName: setup.contactName ?? '',
    },
    workSettings: settings,
    saturdayCareEnabled: settings.saturdayOperationEnabled,
    classRequirements: classes.map(({ classType }) => {
      const saved = requirementMap.get(classType);
      return {
        classType,
        weekdayRequired: saved?.weekdayRequired ?? 0,
        saturdayRequired: saved?.saturdayRequired ?? 0,
        isActive: saved?.isActive ?? true,
      };
    }),
    accepted: setup.termsVersionCurrent && setup.privacyVersionCurrent,
  };
}

export function SetupWizard({
  session,
  initialSetup,
  onComplete,
  onLogout,
}: {
  session: Session;
  initialSetup: SetupState;
  onComplete: (setup: SetupState) => void;
  onLogout: () => void;
}) {
  const [setup, setSetup] = useState(initialSetup);
  const [step, setStep] = useState(() => resumeSetupStep(initialSetup));
  const [draft, setDraft] = useState(() => createDraft(initialSetup));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const progress = useMemo(() => `${(step / steps.length) * 100}%`, [step]);
  const setTenant = (key: keyof TenantDraft, value: string) => {
    setDraft((current) => ({ ...current, tenant: { ...current.tenant, [key]: value } }));
  };
  const setSetting = (key: keyof ShiftSetting, value: string | number | boolean) => {
    setDraft((current) => ({ ...current, workSettings: { ...current.workSettings, [key]: value } }));
  };

  async function saveCurrentStep() {
    if (step === 1) {
      return api.updateSetupTenant(session.accessToken, {
        name: draft.tenant.name.trim(),
        postalCode: draft.tenant.postalCode.trim(),
        prefecture: '',
        city: '',
        addressLine: draft.tenant.addressLine.trim(),
        phone: draft.tenant.phone.trim(),
        contactName: draft.tenant.directorName.trim(),
        contactEmail: draft.tenant.contactEmail.trim(),
      });
    }
    if (step === 2) {
      const settings = draft.workSettings;
      return api.updateSetupWorkSettings(session.accessToken, {
        defaultStartNormal: settings.defaultStartNormal,
        defaultEndNormal: settings.defaultEndNormal,
        defaultStartEarly: settings.defaultStartEarly,
        defaultEndEarly: settings.defaultEndEarly,
        defaultStartLate: settings.defaultStartLate,
        defaultEndLate: settings.defaultEndLate,
        maxConsecutiveWorkDays: settings.maxConsecutiveWorkDays,
        weekdayEarlyRequired: settings.weekdayEarlyRequired,
        weekdayLateRequired: settings.weekdayLateRequired,
        saturdayOperationEnabled: draft.saturdayCareEnabled,
        saturdayMinimumStaff: draft.saturdayCareEnabled ? settings.saturdayMinimumStaff : 0,
        saturdayEarlyRequired: draft.saturdayCareEnabled
          ? Math.max(settings.saturdayEarlyRequired, settings.weekdayEarlyRequired)
          : 0,
        saturdayLateRequired: draft.saturdayCareEnabled
          ? Math.max(settings.saturdayLateRequired, settings.weekdayLateRequired)
          : 0,
      });
    }
    if (step === 3) {
      return api.updateSetupClassRequirements(
        session.accessToken,
        draft.classRequirements.map((row) => ({
          ...row,
          saturdayRequired: draft.saturdayCareEnabled ? row.weekdayRequired : 0,
        })),
      );
    }
    return api.updateSetupConsents(session.accessToken, { acceptTerms: true, acceptPrivacy: true });
  }

  async function next() {
    const errors = validateSetupStep(step, draft);
    if (errors.length) {
      setToast({ kind: 'error', text: errors[0] });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const saved = await saveCurrentStep();
      const nextStep = moveSetupStep(step, 1);
      const progressed = await api.updateSetupProgress(session.accessToken, nextStep);
      setSetup(progressed);
      setStep(nextStep);
      setToast({ kind: 'success', text: `${steps[step - 1]}を保存しました。` });
      if (step === 4) setDraft((current) => ({ ...current, accepted: saved.termsVersionCurrent && saved.privacyVersionCurrent }));
    } catch (error) {
      setToast({ kind: 'error', text: error instanceof Error ? error.message : '設定を保存できませんでした。入力内容を確認して、もう一度お試しください。' });
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    const previous = moveSetupStep(step, -1);
    if (previous === step) return;
    setBusy(true);
    setToast(null);
    try {
      const progressed = await api.updateSetupProgress(session.accessToken, previous);
      setSetup(progressed);
      setStep(previous);
    } catch (error) {
      setToast({ kind: 'error', text: error instanceof Error ? error.message : '前のステップへ戻れませんでした。' });
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    setToast(null);
    try {
      const completed = await api.completeSetup(session.accessToken);
      setToast({ kind: 'success', text: '初期設定が完了しました。' });
      onComplete(completed);
    } catch (error) {
      setToast({ kind: 'error', text: error instanceof Error ? error.message : '初期設定を完了できませんでした。' });
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div><p className="text-sm font-semibold text-emerald-700">EnShift</p><p className="font-bold">{session.tenant.name}</p></div>
        <div className="flex items-center gap-3"><p className="hidden text-sm text-slate-600 sm:block">{session.user.displayName}</p><button type="button" onClick={onLogout} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">ログアウト</button></div>
      </div>
    </header>
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-sm font-semibold text-emerald-700">初回セットアップ</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">園の初期設定</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">入力内容はステップごとに保存され、次回ログイン時に続きから再開できます。</p>

      <nav aria-label="初期設定の進捗" className="mt-6 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <ol className="grid grid-cols-5 gap-1 sm:gap-3">
          {steps.map((label, index) => {
            const number = index + 1;
            const active = number === step;
            const done = number < step;
            return <li key={label} aria-current={active ? 'step' : undefined} className="min-w-0 text-center">
              <span className={`mx-auto grid size-8 place-items-center rounded-full text-sm font-bold ${active ? 'bg-emerald-700 text-white ring-4 ring-emerald-100' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{done ? '✓' : number}</span>
              <span className={`mt-2 block truncate text-[10px] font-medium sm:text-sm ${active ? 'text-emerald-800' : 'text-slate-500'}`}>{label}</span>
            </li>;
          })}
        </ol>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div data-testid="setup-progress" className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: progress }} /></div>
        <p className="mt-2 text-right text-sm font-semibold text-slate-600">{step} / {steps.length}</p>
      </nav>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-7">
        {step === 1 && <TenantStep value={draft.tenant} onChange={setTenant} />}
        {step === 2 && <WorkStep draft={draft} setDraft={setDraft} setSetting={setSetting} />}
        {step === 3 && <ClassStep rows={draft.classRequirements} setDraft={setDraft} />}
        {step === 4 && <ConsentStep accepted={draft.accepted} setAccepted={(accepted) => setDraft((current) => ({ ...current, accepted }))} setup={setup} />}
        {step === 5 && <CompleteStep setup={setup} />}
        <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between">
          <button type="button" onClick={back} disabled={busy || step === 1} className="min-h-12 rounded-lg border border-slate-300 px-6 font-semibold disabled:opacity-40">戻る</button>
          {step < 5
            ? <button type="button" onClick={next} disabled={busy || (step === 4 && !draft.accepted)} className="min-h-12 rounded-lg bg-emerald-700 px-8 font-semibold text-white hover:bg-emerald-800 disabled:opacity-40">{busy ? '保存中…' : '保存して次へ'}</button>
            : <button type="button" onClick={complete} disabled={busy} className="min-h-12 rounded-lg bg-emerald-700 px-8 font-semibold text-white hover:bg-emerald-800 disabled:opacity-40">{busy ? '完了処理中…' : '初期設定を完了'}</button>}
        </div>
      </section>
    </section>
    {toast && <div role={toast.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${toast.kind === 'error' ? 'bg-rose-700 text-white' : 'bg-emerald-800 text-white'}`}>{toast.text}<button type="button" onClick={() => setToast(null)} aria-label="メッセージを閉じる" className="float-right ml-3">×</button></div>}
  </main>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><p className="text-sm font-semibold text-emerald-700">Step</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{required && <span className="sr-only">（必須）</span>}{required && <span aria-hidden="true" className="-mt-6 ml-auto rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">必須</span>}{children}</label>;
}
function TenantStep({ value, onChange }: { value: TenantDraft; onChange: (key: keyof TenantDraft, value: string) => void }) {
  return <div><SectionTitle title="園情報" description="園の基本情報を入力してください。" /><div className="mt-6 grid gap-5 sm:grid-cols-2">
    <Field label="園名" required><input className="input" maxLength={120} required value={value.name} onChange={(event) => onChange('name', event.target.value)} /></Field>
    <Field label="メールアドレス" required><input className="input" type="email" maxLength={254} required value={value.contactEmail} onChange={(event) => onChange('contactEmail', event.target.value)} /></Field>
    <Field label="郵便番号"><input className="input" inputMode="numeric" maxLength={16} placeholder="123-4567" value={value.postalCode} onChange={(event) => onChange('postalCode', event.target.value)} /></Field>
    <Field label="電話番号"><input className="input" type="tel" maxLength={40} placeholder="03-1234-5678" value={value.phone} onChange={(event) => onChange('phone', event.target.value)} /></Field>
    <div className="sm:col-span-2"><Field label="住所"><input className="input" maxLength={160} value={value.addressLine} onChange={(event) => onChange('addressLine', event.target.value)} /></Field></div>
    <div className="sm:col-span-2"><Field label="園長氏名"><input className="input" maxLength={120} value={value.directorName} onChange={(event) => onChange('directorName', event.target.value)} /></Field></div>
  </div></div>;
}
function TimeRange({ label, start, end, onStart, onEnd }: { label: string; start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void }) {
  return <fieldset className="rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">{label}</legend><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input aria-label={`${label} 開始`} className="input" type="time" required value={start} onChange={(event) => onStart(event.target.value)} /><span className="text-slate-500">〜</span><input aria-label={`${label} 終了`} className="input" type="time" required value={end} onChange={(event) => onEnd(event.target.value)} /></div></fieldset>;
}
function WorkStep({ draft, setDraft, setSetting }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; setSetting: (key: keyof ShiftSetting, value: string | number | boolean) => void }) {
  const settings = draft.workSettings;
  return <div><SectionTitle title="勤務設定" description="標準の勤務時間と配置ルールを設定してください。" /><div className="mt-6 grid gap-4">
    <TimeRange label="通常勤務時間" start={settings.defaultStartNormal} end={settings.defaultEndNormal} onStart={(value) => setSetting('defaultStartNormal', value)} onEnd={(value) => setSetting('defaultEndNormal', value)} />
    <TimeRange label="早出時間" start={settings.defaultStartEarly} end={settings.defaultEndEarly} onStart={(value) => setSetting('defaultStartEarly', value)} onEnd={(value) => setSetting('defaultEndEarly', value)} />
    <TimeRange label="遅出時間" start={settings.defaultStartLate} end={settings.defaultEndLate} onStart={(value) => setSetting('defaultStartLate', value)} onEnd={(value) => setSetting('defaultEndLate', value)} />
    <label className="flex min-h-12 items-center gap-3 rounded-xl border p-4 text-sm font-semibold"><input type="checkbox" className="size-5 accent-emerald-700" checked={draft.saturdayCareEnabled} onChange={(event) => setDraft((current) => ({ ...current, saturdayCareEnabled: event.target.checked }))} />土曜保育を行う</label>
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="最大連続勤務日数"><input className="input" type="number" min={1} max={14} value={settings.maxConsecutiveWorkDays} onChange={(event) => setSetting('maxConsecutiveWorkDays', Number(event.target.value))} /></Field>
      <Field label="土曜最低勤務人数"><input className="input" type="number" min={0} max={100} disabled={!draft.saturdayCareEnabled} value={settings.saturdayMinimumStaff} onChange={(event) => setSetting('saturdayMinimumStaff', Number(event.target.value))} /></Field>
      <Field label="必要早出人数"><input className="input" type="number" min={0} max={100} value={settings.weekdayEarlyRequired} onChange={(event) => setSetting('weekdayEarlyRequired', Number(event.target.value))} /></Field>
      <Field label="必要遅出人数"><input className="input" type="number" min={0} max={100} value={settings.weekdayLateRequired} onChange={(event) => setSetting('weekdayLateRequired', Number(event.target.value))} /></Field>
    </div>
  </div></div>;
}
function ClassStep({ rows, setDraft }: { rows: RequirementDraft[]; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  return <div><SectionTitle title="クラス設定" description="各クラスに必要な職員人数を入力してください。" /><div className="mt-6 grid gap-3 sm:grid-cols-2">
    {classes.map(({ classType, label }) => {
      const row = rows.find((item) => item.classType === classType)!;
      return <label key={classType} className="flex items-center justify-between gap-4 rounded-xl border p-4 text-sm font-semibold"><span>{label}</span><span className="flex items-center gap-2"><input aria-label={`${label} 必要人数`} className="input w-24 text-right" type="number" min={0} max={100} value={row.weekdayRequired} onChange={(event) => setDraft((current) => ({ ...current, classRequirements: current.classRequirements.map((item) => item.classType === classType ? { ...item, weekdayRequired: Number(event.target.value) } : item) }))} /><span className="text-slate-500">人</span></span></label>;
    })}
  </div></div>;
}
function ConsentStep({ accepted, setAccepted, setup }: { accepted: boolean; setAccepted: (value: boolean) => void; setup: SetupState }) {
  return <div><SectionTitle title="利用規約" description="内容をご確認のうえ、同意してください。" /><div className="mt-6 grid gap-4">
    <article className="max-h-40 overflow-y-auto rounded-xl border bg-slate-50 p-4 text-sm leading-6"><h3 className="font-bold">利用規約（{setup.currentTermsVersion}）</h3><p className="mt-2 text-slate-600">EnShiftを園内のシフト管理目的で適切に利用し、アカウント情報を安全に管理してください。登録内容の正確性は利用者が確認するものとします。</p></article>
    <article className="max-h-40 overflow-y-auto rounded-xl border bg-slate-50 p-4 text-sm leading-6"><h3 className="font-bold">プライバシーポリシー（{setup.currentPrivacyVersion}）</h3><p className="mt-2 text-slate-600">サービス提供、本人確認、勤務管理および安全性確保のために必要な情報を取り扱います。園のデータはテナント単位で管理されます。</p></article>
    <label className="flex min-h-14 items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 font-semibold"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-emerald-700" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />利用規約およびプライバシーポリシーに同意する</label>
  </div></div>;
}
function CompleteStep({ setup }: { setup: SetupState }) {
  return <div className="py-8 text-center"><span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</span><h2 className="mt-5 text-2xl font-bold">初期設定が完了しました</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">「初期設定を完了」を押すと設定を確定し、ダッシュボードへ移動します。</p>{!setup.canComplete && <p role="alert" className="mx-auto mt-5 max-w-lg rounded-lg bg-amber-50 p-3 text-sm text-amber-800">完了条件を確認しています。完了できない場合は前のステップの入力内容をご確認ください。</p>}</div>;
}
