import manifest from './manifest.json';

/**
 * Asset registry. `import.meta.glob` is resolved at BUILD time: only files that actually exist under
 * src/assets/ are bundled, so missing assets cost nothing (no 404s) and nothing is ever loaded from
 * a runtime-provided path. Drop a file at the path the manifest names and rebuild.
 */
const files = import.meta.glob('./{images,sounds}/**/*.{png,jpg,jpeg,webp,ogg,mp3,m4a,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type AssetKind = 'images' | 'sounds';

const KEY = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;
const PATH = /^(images|sounds)\/[a-zA-Z0-9_\-/]+\.(png|jpg|jpeg|webp|ogg|mp3|m4a|wav)$/;

/** [key, bundled url] for every manifest entry whose file exists. */
export function availableAssets(kind: AssetKind): [string, string][] {
  const table = (manifest as unknown as Record<AssetKind, Record<string, string>>)[kind] ?? {};
  const out: [string, string][] = [];
  for (const [key, rel] of Object.entries(table)) {
    if (!KEY.test(key) || typeof rel !== 'string' || !PATH.test(rel) || rel.includes('..')) continue;
    const url = files[`./${rel}`];
    if (url) out.push([key, url]);
  }
  return out;
}

/** All manifest keys (for ASSETS.md checks / debugging). */
export function manifestKeys(kind: AssetKind): string[] {
  return Object.keys((manifest as unknown as Record<AssetKind, Record<string, string>>)[kind] ?? {});
}
