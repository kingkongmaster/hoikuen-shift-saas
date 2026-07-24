export const SETUP_STEP_COUNT = 5;

export function canUseSetupWizard(role) {
  return role === 'ADMIN' || role === 'DIRECTOR';
}

export function isSetupComplete(setup) {
  return setup?.setupStatus === 'COMPLETED' || Boolean(setup?.setupCompletedAt);
}

export function resumeSetupStep(setup) {
  if (isSetupComplete(setup)) return SETUP_STEP_COUNT;
  const step = Number(setup?.setupCurrentStep ?? 1);
  return Math.min(SETUP_STEP_COUNT, Math.max(1, Number.isInteger(step) ? step : 1));
}

export function moveSetupStep(step, direction) {
  return Math.min(SETUP_STEP_COUNT, Math.max(1, step + direction));
}

export function setupLayoutForWidth(width) {
  return width <= 390 ? 'mobile' : 'desktop';
}

export function validateSetupStep(step, draft) {
  const errors = [];
  if (step === 1) {
    if (!draft.tenant.name.trim()) errors.push('園名を入力してください。');
    if (!draft.tenant.contactEmail.trim()) errors.push('メールアドレスを入力してください。');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.tenant.contactEmail)) errors.push('メールアドレスの形式を確認してください。');
  }
  if (step === 2) {
    const settings = draft.workSettings;
    const nonNegative = ['weekdayEarlyRequired', 'weekdayLateRequired'];
    if (nonNegative.some((key) => !Number.isInteger(settings[key]) || settings[key] < 0)) errors.push('必要人数は0以上の整数で入力してください。');
    if (!Number.isInteger(settings.maxConsecutiveWorkDays) || settings.maxConsecutiveWorkDays < 1) errors.push('最大連続勤務日数は1以上の整数で入力してください。');
    for (const [start, end, label] of [['defaultStartEarly', 'defaultEndEarly', '早出'], ['defaultStartNormal', 'defaultEndNormal', '通常勤務'], ['defaultStartLate', 'defaultEndLate', '遅出']]) {
      if (!settings[start] || !settings[end] || settings[start] >= settings[end]) errors.push(`${label}の終了時刻は開始時刻より後にしてください。`);
    }
  }
  if (step === 3 && draft.classRequirements.some((row) => !Number.isInteger(row.weekdayRequired) || row.weekdayRequired < 0)) {
    errors.push('クラス必要人数は0以上の整数で入力してください。');
  }
  if (step === 4 && !draft.accepted) errors.push('利用規約およびプライバシーポリシーへの同意が必要です。');
  return errors;
}
