const fields = ['name', 'contactEmail', 'postalCode', 'prefecture', 'city', 'addressLine', 'phone', 'contactName'];

export function profileDraft(profile) {
  return Object.fromEntries(fields.map(key => [key, profile[key] ?? '']));
}

export function hasProfile(profile) {
  return Boolean(profile.name?.trim() && profile.contactEmail?.trim());
}

// Omitted fields retain their stored value, including null and whitespace.
// Required API fields are included only when an actual edit needs a PATCH.
export function profilePatch(profile, draft) {
  const changed = Object.fromEntries(fields.filter(key => draft[key] !== (profile[key] ?? ''))
    .map(key => [key, draft[key].trim()]));
  if (!Object.keys(changed).length) return null;
  return { name: profile.name, contactEmail: profile.contactEmail ?? '', ...changed };
}
