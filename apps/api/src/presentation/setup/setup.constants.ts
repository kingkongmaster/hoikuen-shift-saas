import { LEGAL_DOCUMENTS } from './legal-documents';
export const TERMS_VERSION = LEGAL_DOCUMENTS.terms.version;
export const PRIVACY_VERSION = LEGAL_DOCUMENTS.privacy.version;
export const LEGAL_RELEASE: { approved: boolean; effectiveDate: string | null; termsHash: string; privacyHash: string } = { ...LEGAL_DOCUMENTS.release, termsHash: LEGAL_DOCUMENTS.terms.contentHash, privacyHash: LEGAL_DOCUMENTS.privacy.contentHash };
