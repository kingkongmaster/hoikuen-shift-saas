import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateMetadata, metadataLabels } from '../../apps/web/release-metadata.mjs';

// Explicit JSON file only. Never serialize process.env or inject credentials.
const [metadataFile, outputFile] = process.argv.slice(2);
if (!metadataFile || !outputFile || existsSync(outputFile)) throw new Error('Usage: build-images.mjs metadata.json NEW-manifest.json');
const metadata = validateMetadata(JSON.parse(readFileSync(metadataFile, 'utf8')));
const root = resolve(import.meta.dirname, '../..');
const sourceManifest = resolve(root, '../source-manifest.json');
if (!existsSync(sourceManifest)) throw new Error('Build from an audited source snapshot with sibling source-manifest.json');
const provenance = JSON.parse(readFileSync(sourceManifest, 'utf8'));
if (!/^[a-f0-9]{40}$/.test(provenance.baseSha) || provenance.baseSha.slice(0,12) !== metadata.gitSha) throw new Error('Source SHA mismatch');
const labels = metadataLabels(metadata);
const manifest = { metadata, platform: 'linux/amd64', source: { baseSha: provenance.baseSha, dirty: provenance.dirty }, images: {} };
for (const app of ['api', 'web']) {
  const tag = `aen-shift-${app}:${metadata.buildId.toLowerCase()}`;
  const args = ['build', '--no-cache', '--platform', manifest.platform, '-t', tag];
  for (const [key, value] of Object.entries(labels)) args.push('--label', `${key}=${value}`);
  if (app === 'api') args.push('--target', 'runtime');
  else args.push('--build-arg', `AEN_RELEASE_METADATA=${JSON.stringify(metadata)}`, '--build-arg', 'VITE_RELEASE_CHANNEL=musubi-beta', '--build-arg', 'VITE_API_BASE_URL=/api');
  args.push(resolve(root, 'apps', app));
  execFileSync('docker', args, { stdio: 'inherit' });
  const [image] = JSON.parse(execFileSync('docker', ['image', 'inspect', tag], { encoding: 'utf8' }));
  for (const [key, value] of Object.entries(labels)) if (image.Config.Labels?.[key] !== value) throw new Error(`Label mismatch: ${app}/${key}`);
  if (image.Architecture !== 'amd64' || image.Os !== 'linux') throw new Error('Wrong architecture');
  manifest.images[app] = { tag, imageId: image.Id, repoDigests: image.RepoDigests,
    baseImages: [...new Set(readFileSync(resolve(root, 'apps', app, 'Dockerfile'), 'utf8').match(/\S+@sha256:[a-f0-9]{64}/g))] };
}
writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
