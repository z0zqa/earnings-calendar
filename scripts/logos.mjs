// Builds logos/: every company's logo redrawn in the app's navy on transparency and cropped to its mark, so every
// logo in the calendar reads in the same colours whatever the brand's own.
// Usage: node scripts/logos.mjs [--force] [TICKER ...]
//   Only tickers in data/earnings.js without a logo yet are fetched; --force redraws them all (after changing the
//   algorithm below), named tickers are always redrawn.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, config, loadData } from './lib.mjs';

export const INK = [0x17, 0x22, 0x36]; // midnight navy (CSS masks would let the app tint them, but browsers block
// masks on pages opened from disk, which is how the Sunday screenshot is taken)
const SIZE = 128; // longest side of the stored mark, enough for a 2x tile
const MIN_SIDE = 32; // a source mark smaller than this is too blurry to use
const RETRY_DAYS = 30; // how long a ticker with no logo anywhere waits before it is tried again

const DIR = join(ROOT, 'logos');
const INDEX = join(DIR, 'index.js');
const PREFIX = 'window.LOGOS = ';
export const fileFor = (t) => `${t.replace(/[^A-Z0-9.-]/gi, '_')}.png`;

const SOURCES = {
  fmp: (t) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t)}.png`,
  parqet: (t) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(t)}?format=png`,
};
function sourcesFor(t) {
  const o = config.logoOverrides?.[t];
  if (o === 'none') return [];
  if (o === 'parqet') return [['parqet', SOURCES.parqet(t)]];
  if (o) return [['override', o]];
  return [['fmp', SOURCES.fmp(t)], ['parqet', SOURCES.parqet(t)]];
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* The ink of a logo, 0–1 per pixel: what belongs to the mark, as opposed to its background.
   - Transparent logos: opaque pixels are ink, except white. Each connected patch of white is judged by what
     surrounds it: free-standing white lettering on transparency (IBM) is the mark; white enclosed by colour (the
     letters cut into AZZ's circle) or a white outline around a coloured shape (COLB) is not.
   - Opaque logos: the background is the colour around the border; ink is whatever differs from it, so white
     lettering on Visa's blue square becomes the mark and the square disappears. When the mark sits on a plate
     of one colour (EPAC's yellow badge), what the plate encloses is cut out of it rather than merged into it. */
export function inkOf({ width: w, height: h, data }) {
  const n = w * h, ink = new Float32Array(n);
  let clear = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) clear++;

  if (clear > n * 0.06) {
    const isClear = (i) => data[i * 4 + 3] < 128;
    const isWhite = (i) => !isClear(i) && lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > 200;
    const comp = new Int32Array(n).fill(-1), inkPatch = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0 || !isWhite(s)) continue;
      const id = inkPatch.length, stack = [s];
      let toClear = 0, toColour = 0;
      comp[s] = id;
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i - x) / w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0) { toClear++; continue; } // the image edge counts as outside
          if (isWhite(j)) { if (comp[j] < 0) { comp[j] = id; stack.push(j); } } else if (isClear(j)) toClear++; else toColour++;
        }
      }
      inkPatch.push(toClear / (toClear + toColour || 1) > 0.7);
    }
    for (let i = 0; i < n; i++) ink[i] = isWhite(i) && !inkPatch[comp[i]] ? 0 : data[i * 4 + 3] / 255;
    // A light card behind the mark is background too; then look for a plate, as for opaque logos.
    cutPlate(ink, data, w, h, { paperOnly: true });
    cutPlate(ink, data, w, h);
    return ink;
  }

  // Background: the median colour of the border.
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const median = (k) => border.map((i) => data[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [median(0), median(1), median(2)];
  const dist = (i, c) => Math.hypot(data[i * 4] - c[0], data[i * 4 + 1] - c[1], data[i * 4 + 2] - c[2]);
  for (let i = 0; i < n; i++) ink[i] = Math.min(1, Math.max(0, (dist(i, bg) - 24) / 72)) * (data[i * 4 + 3] / 255);

  cutPlate(ink, data, w, h);
  return ink;
}

/* The plate: the colour of the ink along its outer edge. A large patch of clearly lighter or darker ink that the
   plate encloses (the symbol on a badge) becomes a cut-out; ink that reaches the background on its own, and the
   soft edges of small lettering, stay. With paperOnly, a light plate that encloses other ink is a card behind the
   mark and is removed instead. Returns whether it changed anything. */
function cutPlate(ink, data, w, h, { paperOnly = false } = {}) {
  const n = w * h;
  const L = (i) => lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const dist = (i, c) => Math.hypot(data[i * 4] - c[0], data[i * 4 + 1] - c[1], data[i * 4 + 2] - c[2]);
  const neighbours = (i) => { const x = i % w, y = (i - x) / w; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; };
  // Sample the plate just inside the mark's outline (up to 3 px in), on fully inked pixels: the outline itself is
  // anti-aliased and would give a blend of the plate and the background.
  const depth = new Uint8Array(n).fill(255), q = [];
  for (let i = 0; i < n; i++) if (ink[i] < 0.2) { depth[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const d = depth[q[k]];
    if (d >= 3) continue;
    for (const j of neighbours(q[k])) if (j >= 0 && depth[j] > d + 1) { depth[j] = d + 1; q.push(j); }
  }
  const edge = [];
  for (let i = 0; i < n; i++) if (depth[i] >= 1 && depth[i] <= 3 && ink[i] > 0.95) edge.push(i);
  if (!edge.length) return false;
  const med = (k) => edge.map((i) => data[i * 4 + k]).sort((a, b) => a - b)[edge.length >> 1];
  const plate = [med(0), med(1), med(2)], plateL = lum(...plate);
  const isPlate = (i) => ink[i] > 0.2 && dist(i, plate) < 60;
  let inkArea = 0, plateArea = 0;
  for (let i = 0; i < n; i++) if (ink[i] > 0.2) { inkArea++; if (isPlate(i)) plateArea++; }
  if (plateArea < inkArea * 0.3 || plateArea > inkArea * 0.95) return false;

  // Ink reachable from the background without crossing the plate stands on its own.
  const free = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (ink[i] <= 0.2) { free[i] = 1; stack.push(i); }
  while (stack.length) for (const j of neighbours(stack.pop())) if (j >= 0 && !free[j] && !isPlate(j)) { free[j] = 1; stack.push(j); }

  // Enclosed patches, kept only when large and clearly lighter or darker than the plate.
  const seen = new Uint8Array(n), cut = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || ink[s] <= 0.2 || isPlate(s) || free[s]) continue;
    const patch = [s]; seen[s] = 1;
    for (let k = 0; k < patch.length; k++) for (const j of neighbours(patch[k])) {
      if (j >= 0 && !seen[j] && ink[j] > 0.2 && !isPlate(j) && !free[j]) { seen[j] = 1; patch.push(j); }
    }
    const contrast = patch.reduce((a, i) => a + Math.abs(L(i) - plateL), 0) / patch.length;
    if (patch.length >= inkArea * 0.015 && contrast > 80) cut.push(...patch);
  }
  if (!cut.length) return false;
  if (paperOnly) {
    if (plateL <= 215) return false;
    for (let i = 0; i < n; i++) if (isPlate(i)) ink[i] = 0;
    return true;
  }
  for (const i of cut) ink[i] = 0;
  return true;
}

// Crop the ink to its bounding box with a small margin, scale it to fit SIZE, and paint it navy.
export function renderInk(ink, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (ink[y * w + x] > 0.1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (Math.max(cw, ch) < MIN_SIDE) return null; // too small to redraw cleanly: a monogram reads better
  const scale = Math.min(1, SIZE / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * scale)), oh = Math.max(1, Math.round(ch * scale));
  const out = new PNG({ width: ow, height: oh });
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    // Box filter: average the source pixels this output pixel covers.
    const sx0 = x0 + ox / scale, sx1 = x0 + (ox + 1) / scale, sy0 = y0 + oy / scale, sy1 = y0 + (oy + 1) / scale;
    let sum = 0, cnt = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
      sum += ink[Math.min(h - 1, sy) * w + Math.min(w - 1, sx)]; cnt++;
    }
    const o = (oy * ow + ox) * 4;
    out.data[o] = INK[0]; out.data[o + 1] = INK[1]; out.data[o + 2] = INK[2];
    out.data[o + 3] = Math.round((sum / cnt) * 255);
  }
  return PNG.sync.write(out, { colorType: 6 });
}

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? buf : null;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function build(t) {
  for (const [src, url] of sourcesFor(t)) {
    const png = await download(url).catch(() => null);
    if (!png) continue;
    let img;
    try { img = PNG.sync.read(png); } catch { continue; }
    const out = renderInk(inkOf(img), img.width, img.height);
    if (!out) continue;
    writeFileSync(join(DIR, fileFor(t)), out);
    return { src, url };
  }
  rmSync(join(DIR, fileFor(t)), { force: true });
  return { src: 'none' };
}

export function loadIndex() {
  if (!existsSync(INDEX)) return {};
  const text = readFileSync(INDEX, 'utf8').trim();
  return JSON.parse(text.slice(PREFIX.length, text.endsWith(';') ? -1 : undefined));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(DIR, { recursive: true });
  const args = process.argv.slice(2), force = args.includes('--force'), named = args.filter((a) => !a.startsWith('--'));
  const index = loadIndex();
  const today = new Date().toISOString().slice(0, 10);
  const tickers = [...new Set(Object.values(loadData().days).flat().map((r) => r.s))];
  const stale = (t) => {
    const e = index[t], pinned = config.logoOverrides?.[t];
    if (!e || Boolean(pinned) !== Boolean(e.pinned)) return true; // new, or an override added or removed
    if (pinned && e.src !== (pinned === 'none' || pinned === 'parqet' ? pinned : 'override')) return true;
    return e.src === 'none' && (Date.parse(today) - Date.parse(e.at)) / 86400000 >= RETRY_DAYS;
  };
  const todo = named.length ? named : tickers.filter((t) => force || stale(t));
  console.log(`${todo.length} of ${tickers.length} logos to build`);

  let done = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 12 }, async () => {
    for (let t; (t = queue.shift()); ) {
      const r = await build(t);
      index[t] = { src: r.src, at: today, ...(config.logoOverrides?.[t] ? { pinned: true } : {}) };
      if (++done % 250 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }));

  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(INDEX, `${PREFIX}{\n${Object.entries(sorted).map(([t, e]) => `${JSON.stringify(t)}:${JSON.stringify(e)}`).join(',\n')}\n};\n`);
  const none = Object.values(sorted).filter((e) => e.src === 'none').length;
  console.log(`Logos: ${Object.keys(sorted).length - none} drawn, ${none} with no logo (monogram).`);
}
