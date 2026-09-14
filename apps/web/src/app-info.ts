import packageJson from '../package.json';

declare const __AEN_RELEASE_METADATA__: Readonly<{ product: string; releaseId: string; buildId: string; gitSha: string; builtAt: string }>;
export const RELEASE_METADATA = __AEN_RELEASE_METADATA__;
export const APP_NAME = RELEASE_METADATA.product;
export const APP_RELEASE_ID = RELEASE_METADATA.releaseId;
export const APP_GIT_SHA = RELEASE_METADATA.gitSha;
export const APP_VERSION = packageJson.version;
export const APP_BUILD = RELEASE_METADATA.buildId;
export const APP_LAST_UPDATED = RELEASE_METADATA.releaseId === 'development' ? '開発版' : RELEASE_METADATA.builtAt.slice(0, 10);
export const APP_DEVELOPER = 'AeN Shift Development Team';
export const APP_SUPPORT_EMAIL = 'support@enshift.jp';
export const APP_COPYRIGHT = `© 2026 AeN Shift`;
