/**
 * Generates PNG icons for the PWA from the SVG favicon.
 * Run once: node scripts/gen-icons.mjs
 *
 * Output: public/icons/icon-{size}x{size}.png
 * The manifest.json references these as the app icon set.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svg = readFileSync(join(root, 'public/favicon.svg'));
const outDir = join(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

// Standard PWA icon sizes required by browser install criteria and app stores.
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const outPath = join(outDir, `icon-${size}x${size}.png`);
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✓  icon-${size}x${size}.png`);
}

console.log(`\nAll icons written to public/icons/`);
