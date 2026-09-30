export const SETUP_STEP_COUNT = 5;

export function canUseSetupWizard(role) {
  return role === 'ADMIN' || role === 'DIRECTOR';
}

export function isSetupComplete(setup) {
  return (setup?.setupStatus === 'COMPLETED' || Boolean(setup?.setupCompletedAt)) && setup?.termsVersionCurrent !== false && setup?.privacyVersionCurrent !== false;
}

export function hasExistingWorkforceSetup(setup) {
  return Boolean(setup?.workforceSetupState === 'COMPLETE' && setup?.preserveWorkforceSetup && setup?.shiftSettings && setup?.classRequirements?.length && setup?.activeStaffCount > 0);
}

export function workforceSetupNeedsReview(setup) {
  return setup?.workforceSetupState === 'NEW' ? false : (!hasExistingWorkforceSetup(setup) || !setup?.workforceReview);
}

export function resumeSetupStep(setup) {
  if (isSetupComplete(setup)) return SETUP_STEP_COUNT;
  if ((setup?.setupStatus === 'COMPLETED' || setup?.setupCompletedAt) && (setup?.termsVersionCurrent === false || setup?.privacyVersionCurrent === false)) return 4;
  const step = Number(setup?.setupCurrentStep ?? 1);
  const normalized = Math.min(SETUP_STEP_COUNT, Math.max(1, Number.isInteger(step) ? step : 1));
  if (hasExistingWorkforceSetup(setup) && normalized > 1) {
    if (!setup.workforceReview?.workConfirmed) return 2;
    if (normalized > 2 && !setup.workforceReview?.staffConfirmed) return 3;
  }
  if (normalized >= 4 && setup?.legalConsentVerified && setup?.canComplete) return 5;
  if (normalized >= 5 && setup?.legalConsentVerified === false) return 4;
  return normalized;
}

export function moveSetupStep(step, direction, setup) {
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
