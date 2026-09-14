const keys = ['product', 'releaseId', 'buildId', 'gitSha', 'builtAt'];
export function validateMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('Invalid release metadata fields');
  if (value.product !== 'AeN Shift' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value.releaseId) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value.buildId) ||
      !/^[a-f0-9]{12}$/.test(value.gitSha) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.builtAt) ||
      new Date(value.builtAt).toISOString() !== value.builtAt.replace('Z', '.000Z')) throw new Error('Invalid release metadata values');
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}
export function readMetadata(raw, required = false) {
  if (raw) return validateMetadata(JSON.parse(raw));
  if (required) throw new Error('Production build requires AEN_RELEASE_METADATA');
  return Object.freeze({product: 'AeN Shift', releaseId: 'development', buildId: 'development', gitSha: '000000000000', builtAt: '1970-01-01T00:00:00Z'});
}
export function metadataLabels(metadata) {
  const m = validateMetadata(metadata);
  return {'org.opencontainers.image.title': m.product, 'org.opencontainers.image.version': m.releaseId,
    'org.opencontainers.image.revision': m.gitSha, 'org.opencontainers.image.created': m.builtAt,
    'jp.aen-shift.build-id': m.buildId};
}

export function buildMetadata(command) { return readMetadata(process.env.AEN_RELEASE_METADATA, command === 'build'); }
