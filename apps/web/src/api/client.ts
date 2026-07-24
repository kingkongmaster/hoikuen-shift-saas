export type Role = 'ADMIN' | 'DIRECTOR' | 'CHIEF' | 'STAFF';
export type Session = {
  accessToken: string;
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; name: string };
  role: Role;
};
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'REEMPLOYED';
export type AssignedClass = 'AGE_0' | 'AGE_1' | 'AGE_2' | 'AGE_3' | 'AGE_4' | 'AGE_5' | 'FREE' | 'SUPPORT';
export type Staff = {
  id: string;
  tenantId: string;
  userId: string | null;
  employeeNumber: string;
  displayName: string;
  email: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  assignedClass: AssignedClass;
  canWorkEarly: boolean;
  canWorkRegular: boolean;
  canWorkLate: boolean;
  earlyShiftOnly: boolean;
  lateShiftOnly: boolean;
  canWorkSaturdays: boolean;
  monthlyWorkHourLimit: number | null;
  weeklyAvailableDays: number | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type StaffInput = Pick<Staff, 'employeeNumber' | 'displayName' | 'employmentType' | 'assignedClass' | 'canWorkEarly' | 'canWorkRegular' | 'canWorkLate' | 'earlyShiftOnly' | 'lateShiftOnly' | 'canWorkSaturdays'> & {
  email?: string | null;
  monthlyWorkHourLimit?: number | null;
  weeklyAvailableDays?: number | null;
  notes?: string | null;
};
export type ShiftRequestType = 'DAY_OFF' | 'PAID_LEAVE' | 'SUMMER_LEAVE' | 'BEREAVEMENT' | 'HALF_DAY_AM' | 'HALF_DAY_PM' | 'OTHER';
export type ShiftRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StaffOption = { id: string; employeeNumber: string; displayName: string };
export type ShiftRequest = {
  id: string;
  tenantId: string;
  staffId: string;
  requestDate: string;
  requestType: ShiftRequestType;
  status: ShiftRequestStatus;
  reason: string | null;
  adminComment: string | null;
  createdAt: string;
  updatedAt: string;
  staff: StaffOption;
};
export type ShiftRequestInput = { staffId?: string; requestDate: string; requestType: ShiftRequestType; reason?: string | null };
export type ShiftRequestUpdate = Partial<Pick<ShiftRequest, 'requestType' | 'status' | 'reason' | 'adminComment'>> & { requestDate?: string };
export type ShiftType = 'EARLY' | 'NORMAL' | 'LATE' | 'OFF' | 'PAID_LEAVE' | 'SUMMER_LEAVE' | 'AM_HALF' | 'PM_HALF' | 'OTHER';
export type MonthlyShiftStatus = 'DRAFT' | 'CONFIRMED';
export type ShiftAssignment = { id: string; tenantId: string; monthlyShiftId: string; staffId: string; workDate: string; shiftType: ShiftType; startTime: string | null; endTime: string | null; breakMinutes: number | null; note: string | null; assignedClass: AssignedClass | null; staff: Pick<Staff, 'id' | 'employeeNumber' | 'displayName' | 'employmentType' | 'assignedClass' | 'canWorkEarly' | 'canWorkLate' | 'earlyShiftOnly' | 'lateShiftOnly' | 'canWorkSaturdays' | 'monthlyWorkHourLimit' | 'weeklyAvailableDays' | 'isActive'> & { isDirector: boolean }; };
export type MonthlyShift = { id: string; tenantId: string; targetMonth: string; status: MonthlyShiftStatus; createdByUserId: string; confirmedByUserId: string | null; confirmedAt: string | null; createdAt: string; updatedAt: string; };
export type ShiftWarning = { code: string; staffId: string; workDate: string; message: string; severity: 'info' | 'warning' | 'blocking' };
export type ShiftView = { schedule: MonthlyShift | null; assignments: ShiftAssignment[]; staff: ShiftAssignment['staff'][]; requests: Array<Pick<ShiftRequest, 'id' | 'staffId' | 'requestDate' | 'requestType' | 'status' | 'reason'> & { staff: Pick<Staff, 'id' | 'displayName'> }>; warnings: ShiftWarning[] };
export type ShiftAssignmentInput = { staffId: string; workDate: string; shiftType: ShiftType; startTime?: string | null; endTime?: string | null; breakMinutes?: number | null; note?: string | null; assignedClass?: AssignedClass | null };
export type GenerationWarning = { code: string; level: 'INFO' | 'WARNING' | 'ERROR'; workDate: string; staffId?: string; classType?: AssignedClass; required?: number; assigned?: number; message: string };
export type GenerationResult = { generatedCount: number; workingAssignmentCount: number; offAssignmentCount: number; leaveAssignmentCount: number; warnings: GenerationWarning[]; processingTimeMs: number; durationMs: number; warningSummary: { INFO: number; WARNING: number; ERROR: number; byCode: Record<string, number> }; appliedSettingsSummary: Record<string, unknown>; closedDateCount: number };
export type ShiftSetting = { weekdayEarlyRequired: number; weekdayLateRequired: number; saturdayEarlyRequired: number; saturdayLateRequired: number; saturdayMinimumStaff: number; saturdayOperationEnabled: boolean; sundayOperationEnabled: boolean; directorCountsTowardStaffing: boolean; directorClassPlacementMode: 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL'; maxConsecutiveWorkDays: number; maxConsecutiveEarlyDays: number; maxConsecutiveLateDays: number; defaultStartEarly: string; defaultEndEarly: string; defaultStartNormal: string; defaultEndNormal: string; defaultStartLate: string; defaultEndLate: string; defaultBreakMinutes: number };
export type ClassRequirement = { id: string; classType: AssignedClass; weekdayRequired: number; saturdayRequired: number; isActive: boolean };
export type ClosedDate = { id: string; closedDate: string; name: string; note: string | null };
export type PrecheckResult = { canGenerate: boolean; fatalIssues: string[]; warnings: Array<{ code: string; level: 'INFO' | 'WARNING' | 'ERROR'; message: string }>; warningSummary: { INFO: number; WARNING: number; ERROR: number; byCode: Record<string, number> }; summary: { activeStaffCount: number; earlyCapableCount: number; lateCapableCount: number; saturdayCapableCount: number; classCounts: Record<string, number>; closedDateCount: number; approvedRequestCount: number; settings: ShiftSetting } };
export type Notification = { id:string; type:string; title:string; message:string; isRead:boolean; createdAt:string };
export type ShiftSwap = { id:string; requesterId:string; targetMemberId:string; requestDate:string; status:'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED'; requestComment:string|null; adminComment:string|null; createdAt:string; requester:{id:string;displayName:string;email:string}; targetMember:{id:string;displayName:string;email:string} };
export type SwapTarget = { userId:string|null; displayName:string; employeeNumber:string };
export type AuditLog = { id:string; memberId:string; action:string; targetType:string; targetId:string; detail:unknown; createdAt:string; member:{id:string;displayName:string;email:string} };
export type PrintShiftData = { tenantName:string; month:string; status:MonthlyShiftStatus; printedAt:string; ownOnly:boolean; closedDates:Array<{date:string;name:string}>; assignments:Array<{employeeNumber:string;staffName:string;date:string;weekday:string;shiftType:string;assignedClass:string;startTime:string|null;endTime:string|null;breakMinutes:number|null;note:string|null}> };
export type BackupValidation = { valid:boolean; errors:string[]; warnings:string[]; metadata:{format:string;version:number;exportedAt:string;tenantName:string;integrity:{algorithm:string;checksum:string}}; counts:Record<string,number> };
export type SetupStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type SetupState = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  contactName: string | null;
  contactEmail: string | null;
  timezone: string;
  setupStatus: SetupStatus;
  setupCurrentStep: number;
  setupCompletedAt: string | null;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  tenant: { id: string; name: string; code: string | null };
  shiftSettings: (ShiftSetting & { id: string; tenantId: string }) | null;
  classRequirements: ClassRequirement[];
  activeStaffCount: number;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  termsVersionCurrent: boolean;
  privacyVersionCurrent: boolean;
  canComplete: boolean;
  missingRequirements: string[];
};
export type SetupTenantInput = {
  name: string;
  phone?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  addressLine?: string;
  contactName?: string;
  contactEmail?: string;
  timezone?: string;
};
export type SubscriptionPlan = 'TRIAL' | 'STANDARD' | 'PROFESSIONAL';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type SubscriptionInfo = {
  id?: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  staffLimit: number;
  activeStaffCount: number;
  remainingStaffSlots: number;
  features: string[];
  readOnly: boolean;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
function fallbackMessage(status: number) {
  if (status === 401) return 'ログインの有効時間が終了しました。お手数ですが、もう一度ログインしてください。';
  if (status === 403) return 'この操作はご利用いただけません。必要な場合は園長または管理者へご相談ください。';
  if (status === 404) return 'お探しの情報が見つかりませんでした。画面を戻って、もう一度ご確認ください。';
  if (status >= 500) return '処理を完了できませんでした。時間をおいてもう一度お試しください。';
  return '入力内容に確認が必要な項目があります。表示された内容をご確認ください。';
}
function responseMessage(data: unknown, status: number) {
  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string').join('、');
    if (message && typeof message === 'object' && typeof (message as { message?: unknown }).message === 'string') return (message as { message: string }).message;
  }
  return fallbackMessage(status);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  emit('enshift:api-start');
  try {
    let response: Response;
    try { response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } }); }
    catch {
      const message = navigator.onLine ? '処理を完了できませんでした。時間をおいてもう一度お試しください。' : '現在オフラインです。通信が回復してから、もう一度お試しください。';
      emit('enshift:api-error', { message }); throw new Error(message);
    }
    if (!response.ok) {
      const message = responseMessage(await response.json().catch(() => null), response.status);
      emit('enshift:api-error', { message }); throw new Error(message);
    }
    return response.json() as Promise<T>;
  } finally { emit('enshift:api-end'); }
}
async function download(path:string, token:string, init:RequestInit={}):Promise<{blob:Blob;name:string}> { emit('enshift:api-start'); try { let response:Response; try { response=await fetch(`${apiBaseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}}); } catch { const message=navigator.onLine?'ファイルを準備できませんでした。時間をおいてもう一度お試しください。':'現在オフラインのため、ファイルを準備できません。通信が回復してからお試しください。';emit('enshift:api-error',{message});throw new Error(message); } const type=response.headers.get('content-type') ?? ''; if(!response.ok || !type.includes('text/csv') && !type.includes('application/json')) { const message=responseMessage(await response.json().catch(()=>null),response.status);emit('enshift:api-error',{message});throw new Error(message); } const disposition=response.headers.get('content-disposition') ?? ''; const name=/filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'enshift-download'; return {blob:await response.blob(),name}; } finally { emit('enshift:api-end'); } }

export const api = {
  login(email: string, password: string) { return request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); },
  me(token: string) { return request<Omit<Session, 'accessToken'>>('/me', {}, token); },
  staff(token: string, includeInactive = false) { return request<Staff[]>(`/staff${includeInactive ? '?includeInactive=true' : ''}`, {}, token); },
  createStaff(token: string, input: StaffInput) { return request<Staff>('/staff', { method: 'POST', body: JSON.stringify(input) }, token); },
  updateStaff(token: string, id: string, input: Partial<StaffInput>) { return request<Staff>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token); },
  deactivateStaff(token: string, id: string) { return request<Staff>(`/staff/${id}`, { method: 'DELETE' }, token); },
  requests(token: string, month: string, staffId?: string) { const query = new URLSearchParams({ month }); if (staffId) query.set('staffId', staffId); return request<ShiftRequest[]>(`/requests?${query.toString()}`, {}, token); },
  requestStaffOptions(token: string) { return request<StaffOption[]>('/requests/staff-options', {}, token); },
  createRequest(token: string, input: ShiftRequestInput) { return request<ShiftRequest>('/requests', { method: 'POST', body: JSON.stringify(input) }, token); },
  updateRequest(token: string, id: string, input: ShiftRequestUpdate) { return request<ShiftRequest>(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token); },
  cancelRequest(token: string, id: string) { return request<ShiftRequest>(`/requests/${id}`, { method: 'DELETE' }, token); },
  shifts(token: string, month: string, staffId?: string) { const query = new URLSearchParams({ month }); if (staffId) query.set('staffId', staffId); return request<ShiftView>(`/shifts?${query.toString()}`, {}, token); },
  createShift(token: string, month: string) { return request<MonthlyShift>('/shifts', { method: 'POST', body: JSON.stringify({ month }) }, token); },
  saveAssignments(token: string, id: string, assignments: ShiftAssignmentInput[]) { return request<ShiftView>(`/shifts/${id}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments }) }, token); },
  confirmShift(token: string, id: string) { return request<MonthlyShift>(`/shifts/${id}/confirm`, { method: 'POST' }, token); },
  reopenShift(token: string, id: string) { return request<MonthlyShift>(`/shifts/${id}/reopen`, { method: 'POST' }, token); },
  generateShift(token: string, id: string) { return request<GenerationResult>(`/shifts/${id}/generate`, { method: 'POST' }, token); },
  precheckShift(token: string, id: string) { return request<PrecheckResult>(`/shifts/${id}/precheck`, { method: 'POST' }, token); },
  shiftSettings(token: string) { return request<ShiftSetting>('/settings/shifts', {}, token); },
  updateShiftSettings(token: string, input: Partial<ShiftSetting>) { return request<ShiftSetting>('/settings/shifts', { method: 'PATCH', body: JSON.stringify(input) }, token); },
  classRequirements(token: string) { return request<ClassRequirement[]>('/settings/class-requirements', {}, token); },
  updateClassRequirements(token: string, requirements: Array<Pick<ClassRequirement, 'classType' | 'weekdayRequired' | 'saturdayRequired' | 'isActive'>>) { return request<ClassRequirement[]>('/settings/class-requirements', { method: 'PATCH', body: JSON.stringify({ requirements }) }, token); },
  closedDates(token: string, month: string) { return request<ClosedDate[]>(`/closed-dates?month=${month}`, {}, token); },
  createClosedDate(token: string, input: { closedDate: string; name: string; note?: string }) { return request<ClosedDate>('/closed-dates', { method: 'POST', body: JSON.stringify(input) }, token); },
  deleteClosedDate(token: string, id: string) { return request<ClosedDate>(`/closed-dates/${id}`, { method: 'DELETE' }, token); },
  notifications(token:string) { return request<Notification[]>('/notifications',{},token); },
  readNotification(token:string,id:string) { return request<Notification>(`/notifications/${id}/read`,{method:'PATCH'},token); },
  readAllNotifications(token:string) { return request<{updatedCount:number}>('/notifications/read-all',{method:'PATCH'},token); },
  shiftSwaps(token:string) { return request<ShiftSwap[]>('/shift-swaps',{},token); },
  shiftSwapTargets(token:string) { return request<SwapTarget[]>('/shift-swaps/targets',{},token); },
  createShiftSwap(token:string,input:{targetMemberId:string;requestDate:string;requestComment?:string}) { return request<ShiftSwap>('/shift-swaps',{method:'POST',body:JSON.stringify(input)},token); },
  updateShiftSwap(token:string,id:string,input:{status:'APPROVED'|'REJECTED';adminComment?:string}) { return request<ShiftSwap>(`/shift-swaps/${id}`,{method:'PATCH',body:JSON.stringify(input)},token); },
  cancelShiftSwap(token:string,id:string) { return request<ShiftSwap>(`/shift-swaps/${id}`,{method:'DELETE'},token); },
  auditLogs(token:string,query:Record<string,string>={}) { const text=new URLSearchParams(Object.entries(query).filter(([,value])=>value)); return request<AuditLog[]>(`/audit-logs${text.size?`?${text}`:''}`,{},token); },
  downloadShiftCsv(token:string,month:string){return download(`/exports/shifts.csv?month=${month}`,token);},
  downloadStaffCsv(token:string){return download('/exports/staff.csv',token);},
  downloadRequestsCsv(token:string,month:string){return download(`/exports/shift-requests.csv?month=${month}`,token);},
  downloadAuditCsv(token:string){return download('/exports/audit.csv',token);},
  printShifts(token:string,month:string,ownOnly=false){return request<PrintShiftData>(`/exports/print/${ownOnly?'my-shift':'shifts'}?month=${month}`,{},token);},
  exportBackup(token:string){return download('/backups/export',token,{method:'POST'});},
  validateBackup(token:string,backup:Record<string,unknown>){return request<BackupValidation>('/backups/validate',{method:'POST',body:JSON.stringify({backup})},token);},
  previewBackup(token:string,backup:Record<string,unknown>){return request<any>('/backups/preview-restore',{method:'POST',body:JSON.stringify({backup})},token);},
  setup(token:string){return request<SetupState>('/setup',{},token);},
  updateSetupTenant(token:string,input:SetupTenantInput){return request<SetupState>('/setup/tenant',{method:'PATCH',body:JSON.stringify(input)},token);},
  updateSetupWorkSettings(token:string,input:Partial<ShiftSetting>){return request<SetupState>('/setup/work-settings',{method:'PATCH',body:JSON.stringify(input)},token);},
  updateSetupClassRequirements(token:string,requirements:Array<Pick<ClassRequirement,'classType'|'weekdayRequired'|'saturdayRequired'|'isActive'>>){return request<SetupState>('/setup/class-requirements',{method:'PATCH',body:JSON.stringify({requirements})},token);},
  updateSetupProgress(token:string,currentStep:number){return request<SetupState>('/setup/progress',{method:'PATCH',body:JSON.stringify({currentStep})},token);},
  updateSetupConsents(token:string,input:{acceptTerms:boolean;acceptPrivacy:boolean}){return request<SetupState>('/setup/consents',{method:'PATCH',body:JSON.stringify(input)},token);},
  completeSetup(token:string){return request<SetupState>('/setup/complete',{method:'POST'},token);},
  subscription(token:string){return request<SubscriptionInfo>('/subscription',{},token);},
};
