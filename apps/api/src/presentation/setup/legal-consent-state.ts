import type { Prisma } from '@prisma/client';
import { LEGAL_RELEASE, PRIVACY_VERSION, TERMS_VERSION } from './setup.constants';

type TenantConsent = { id?: string; termsAcceptedAt: Date | null; privacyAcceptedAt: Date | null; termsVersion: string | null; privacyVersion: string | null };
export async function legalConsentState(db: Pick<Prisma.TransactionClient, 'auditLog'>, tenantId: string, userId: string, tenant: TenantConsent) {
  // Never infer a person's consent from a tenant-level version field alone.
  const rows = userId ? await db.auditLog.findMany({ where: { tenantId, memberId: userId, targetType: 'Tenant', targetId: tenantId, action: { in: ['TERMS_ACCEPTED', 'PRIVACY_ACCEPTED'] } }, select: { action: true, detail: true, createdAt: true } }) : [];
  const check = (kind: 'terms' | 'privacy') => {
    const acceptedAt = tenant[kind === 'terms' ? 'termsAcceptedAt' : 'privacyAcceptedAt'];
    const version = kind === 'terms' ? TERMS_VERSION : PRIVACY_VERSION;
    if (!acceptedAt) return 'NOT_ACCEPTED' as const;
    if (tenant[kind === 'terms' ? 'termsVersion' : 'privacyVersion'] !== version) return 'OUTDATED' as const;
    const verified = LEGAL_RELEASE.approved && rows.some(row => {
      const e = row.detail as Record<string, unknown> | null;
      return row.action === (kind === 'terms' ? 'TERMS_ACCEPTED' : 'PRIVACY_ACCEPTED') && e?.version === version && e?.[kind + 'Version'] === version && e?.[kind + 'Hash'] === LEGAL_RELEASE[kind === 'terms' ? 'termsHash' : 'privacyHash'] && e?.agreedAt === acceptedAt.toISOString() && row.createdAt.getTime() === acceptedAt.getTime() && e?.effectiveDate === LEGAL_RELEASE.effectiveDate && typeof e?.effectiveDate === 'string' && e.effectiveDate <= acceptedAt.toISOString().slice(0, 10) && acceptedAt.getTime() <= Date.now();
    });
    return verified ? 'VERIFIED' as const : 'EVIDENCE_MISMATCH' as const;
  };
  const terms = check('terms'), privacy = check('privacy');
  const status = terms === 'VERIFIED' && privacy === 'VERIFIED' ? 'VERIFIED' : [terms, privacy].includes('EVIDENCE_MISMATCH') ? 'EVIDENCE_MISMATCH' : [terms, privacy].includes('OUTDATED') ? 'OUTDATED' : 'NOT_ACCEPTED';
  return { legalConsentVerified: status === 'VERIFIED', legalConsentStatus: status, termsVerified: terms === 'VERIFIED', privacyVerified: privacy === 'VERIFIED' };
}
