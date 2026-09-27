/**
 * builds the PWA icons from images/app-icon-source.jpg
 * run:  npm run icons
 *
 * the source is 1199x1519 (portrait). app icons must be square, so we
 * centre-crop to a square first, then emit the sizes each platform wants:
 *   - 512 / 192  : manifest icons (android install prompt)
 *   - 512 maskable: same art, extra 10% padding so android's circular mask
 *                   never cuts the face
 *   - 180        : apple-touch-icon (ios home screen)
 *   - 32         : favicon
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'images', 'app-icon-source.jpg');

const src = sharp(SRC);
const { width, height } = await src.metadata();
const side = Math.min(width, height);
const left = Math.floor((width - side) / 2);
const top = Math.floor((height - side) / 2);

/** centre-cropped square */
const square = (size) =>
  sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { fit: 'cover' })
    .png({ quality: 92, compressionLevel: 9 });

/** same art, but scaled down onto a padded canvas — survives a circular mask */
const maskable = (size) => {
  const inner = Math.round(size * 0.8); // 20% safe margin
  return sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .resize(inner, inner, { fit: 'cover' })
    .extend({
      top: Math.round((size - inner) / 2),
      bottom: Math.round((size - inner) / 2),
      left: Math.round((size - inner) / 2),
      right: Math.round((size - inner) / 2),
      background: { r: 13, g: 5, b: 8, alpha: 1 }, // #0d0508 = page background
    })
    .png({ compressionLevel: 9 });
};

const jobs = [
  ['images/icon-512.png', square(512)],
  ['images/icon-192.png', square(192)],
  ['images/icon-maskable-512.png', maskable(512)],
  ['images/apple-touch-icon.png', square(180)],
  ['images/favicon-32.png', square(32)],
];

for (const [out, pipeline] of jobs) {
  const buf = await pipeline.toBuffer();
  writeFileSync(join(root, out), buf);
  console.log(`  ${out.padEnd(30)} ${String(statSync(join(root, out)).size).padStart(7)} bytes`);
}
console.log(`\nbuilt ${jobs.length} icons from a ${width}x${height} source`);
