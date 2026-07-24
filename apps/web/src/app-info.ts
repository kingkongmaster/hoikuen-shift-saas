import packageJson from '../package.json';

export const APP_NAME = 'EnShift';
export const APP_VERSION = packageJson.version;
export const APP_BUILD = import.meta.env.VITE_APP_BUILD ?? '20260723.11A-RC1';
export const APP_LAST_UPDATED = '2026-07-23';
export const APP_DEVELOPER = 'EnShift Development Team';
export const APP_SUPPORT_EMAIL = 'support@enshift.jp';
export const APP_COPYRIGHT = `© 2026 EnShift`;
