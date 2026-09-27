/**
 * reports the real bitrate / duration / sample rate of an mp3.
 * run: node tools/probe-audio.mjs [path]
 *
 * WHY: the song is 8 MB of a 10.3 MB site. this parses the MPEG frame headers
 * to show what it was actually encoded at, so we know whether re-encoding to
 * a lower bitrate is worth the effort for a background song.
 */
import { readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || 'media/audio/khalini.mp3';
const path = join(root, file);

const buf = readFileSync(path);
const size = statSync(path).size;

/* MPEG audio version -> bitrate table (kbps), index 0 = free, 15 = bad */
const V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const V1L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
const V1L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
const RATES = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};
const SAMPLES = { 3: 1152, 2: 576, 0: 576 };

/* find the first valid frame header, skipping any id3 tag */
let off = 0;
if (buf.slice(0, 3).toString('latin1') === 'ID3') {
  const sz = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  off = 10 + sz;
}
function parseFrame(pos) {
  if (pos + 4 > buf.length) return null;
  if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (buf[pos + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  if (verBits === 1) return null;
  const layerBits = (buf[pos + 1] >> 1) & 3; // 1 = Layer III
  if (layerBits !== 1) return null;
  const brIdx = (buf[pos + 2] >> 4) & 0xf;
  const srIdx = (buf[pos + 2] >> 2) & 3;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const ver = verBits === 3 ? 3 : verBits;
  const table = ver === 3 ? V1L3 : V2L3;
  const kbps = table[brIdx];
  if (!kbps) return null;
  return {
    kbps,
    ver,
    layer: 3,
    rate: RATES[ver][srIdx],
    samples: SAMPLES[ver],
    chanMode: (buf[pos + 3] >> 6) & 3,
  };
}
let first = null;
for (let i = off; i < Math.min(off + 200000, buf.length - 4); i++) {
  const f = parseFrame(i);
  if (f) { first = { ...f, at: i }; break; }
}
if (!first) { console.error('no MPEG frame found — not a plain mp3'); process.exit(1); }

/* sample the bitrate across the file to see if it is CBR or VBR */
const kinds = new Map();
let frames = 0;
for (let i = first.at; i < buf.length - 4; i++) {
  const f = parseFrame(i);
  if (!f) continue;
  kinds.set(f.kbps, (kinds.get(f.kbps) || 0) + 1);
  frames++;
  if (frames > 4000) break;
}
const list = [...kinds.entries()].sort((a, b) => b[1] - a[1]);

const bytesPerSec = (first.kbps * 1000) / 8;
const seconds = size / bytesPerSec;
const m = Math.floor(seconds / 60);
const s = Math.round(seconds % 60);

console.log(`file        ${file}`);
console.log(`size        ${(size / 1048576).toFixed(2)} MB`);
console.log(`duration    ~${m}:${String(s).padStart(2, '0')}`);
console.log(`bitrate     ${first.kbps} kbps   (${list.map(([k, n]) => `${k}k×${n}`).join('  ')})`);
console.log(`sample rate ${first.rate} Hz`);
console.log(`channels    ${first.chanMode === 3 ? 'mono' : 'stereo'}`);
console.log(`cbr?        ${list.length === 1 ? 'yes (constant)' : `no (${list.length} different rates — VBR)`}`);
console.log('');
for (const kbps of [192, 128, 112, 96]) {
  const mb = (seconds * kbps * 1000) / 8 / 1048576;
  console.log(
    `  re-encode @ ${String(kbps).padStart(3)} kbps -> ${mb.toFixed(2)} MB  (saves ${(size / 1048576 - mb).toFixed(2)} MB)`
  );
}
