import type { SetupState, SetupTenantInput } from '../../api/client';
type ProfileDraft = { name: string; contactEmail: string; postalCode: string; prefecture: string; city: string; addressLine: string; phone: string; contactName: string };
export function profileDraft(profile: SetupState): ProfileDraft;
export function hasProfile(profile: SetupState): boolean;
export function profilePatch(profile: SetupState, draft: ProfileDraft): SetupTenantInput | null;
