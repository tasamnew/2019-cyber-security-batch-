/**
 * Generate the PWA / social icon set from a single source SVG.
 *
 * Run with: node scripts/generate-icons.mjs
 *
 * Why this is a script and not checked-in binaries only: the maskable variant
 * has to be re-derived whenever the mark changes, and a maskable icon that
 * silently drifts out of the safe zone only fails at install time on a real
 * device, which is not a place to discover a regression.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'public', 'icons');

/** Brand mark, drawn at 512 in icon.svg. */
const ICON = join(here, 'assets', 'icon.svg');

// Android's adaptive-icon mask crops to a circle of 80% of the canvas diameter
// (a "safe zone" of 40% radius). Content outside that is lost, so the maskable
// variant is drawn on an opaque plate with the mark inset to ~62% width.
const PLATE = '#0b1120';

const targets = [
  // filename, size, purpose (drives the `purpose` field in the manifest)
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-192.png', size: 192, purpose: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
  // iOS ignores the manifest entirely and reads apple-touch-icon. It also
  // refuses transparent icons: it composites them on black, which turns the
  // dark plate into a black square with an invisible edge.
  { file: 'apple-touch-icon.png', size: 180, purpose: 'apple' },
  { file: 'favicon-32.png', size: 32, purpose: 'favicon' },
];

async function render(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

function maskableSvg(inner) {
  // The mark is scaled to 62% and centred, leaving a margin that survives the
  // circular crop on every launcher.
  const inset = Math.round((512 * 0.62) / 2);
  const scale = 512 * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${PLATE}"/>
  <g transform="translate(${(512 - scale) / 2} ${(512 - scale) / 2}) scale(${scale / 512})">
    ${inner.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}
  </g>
</svg>`;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const base = await import('node:fs/promises').then((fs) => fs.readFile(ICON, 'utf8'));
  const plain = base.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  for (const { file, size, purpose } of targets) {
    // maskable and apple get the opaque plate; `any` stays transparent so it
    // sits correctly on a themed launcher background.
    const svg =
      purpose === 'maskable' || purpose === 'apple'
        ? maskableSvg(base)
        : base;

    const buf = await render(svg, size);
    await writeFile(join(outDir, file), buf);
    console.log(`${file.padEnd(28)} ${size}x${size}  ${purpose}  ${(buf.length / 1024).toFixed(1)} kB`);
  }

  // Social card. Platforms render this in a wide crop, so the mark sits left
  // with the wordmark beside it rather than being centred.
  const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3df5a3"/>
      <stop offset="1" stop-color="#16a34a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b1120"/>
  <g opacity="0.06" stroke="#3df5a3" stroke-width="1">
    ${Array.from({ length: 26 }, (_, i) => `<line x1="${i * 48}" y1="0" x2="${i * 48}" y2="630"/>`).join('')}
    ${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 48}" x2="1200" y2="${i * 48}"/>`).join('')}
  </g>
  <g transform="translate(112 155) scale(0.625)">${plain}</g>
  <text x="470" y="316" font-family="Segoe UI, Inter, system-ui, sans-serif" font-size="86" font-weight="700" fill="#f8fafc">CS Hub</text>
  <text x="470" y="374" font-family="Segoe UI, Inter, system-ui, sans-serif" font-size="34" fill="#94a3b8">2019 Cyber Security Student Group</text>
  <text x="470" y="430" font-family="Segoe UI, Inter, system-ui, sans-serif" font-size="27" fill="#3df5a3">Discussion &#183; Resources &#183; CTF &#183; Assignments</text>
</svg>`;

  const card = await sharp(Buffer.from(wide)).png().toBuffer();
  await writeFile(join(outDir, 'social-card.png'), card);
  console.log(`social-card.png            1200x630  og  ${(card.length / 1024).toFixed(1)} kB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
