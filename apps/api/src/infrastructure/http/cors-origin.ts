export function configuredOrigins(value: string | undefined): true | string[] {
  if (process.env.NODE_ENV !== 'production' && !value) return true;
  return (value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined, allowed: true | string[]): boolean {
  return allowed === true || !origin || allowed.includes(origin);
}
