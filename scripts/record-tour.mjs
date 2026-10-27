/* Records docs/tour.gif: a walk through the app on the committed data, with live logos.
   Usage: npm run record:tour  [-- --week YYYY-MM-DD --out docs/tour.gif --width 1200 --height 760] */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { ROOT } from './lib.mjs';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('out', join(ROOT, 'docs', 'tour.gif'));
const W = Number(arg('width', 1200)), H = Number(arg('height', 760));
const url = `${pathToFileURL(join(ROOT, 'index.html')).href}${arg('week') ? `?week=${arg('week')}` : ''}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: 'light' });
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });

const frames = [];
const pause = (ms) => page.waitForTimeout(ms);
const logos = () => page.waitForFunction(() => [...document.querySelectorAll('.tile img[src]')]
  .filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete), null, { timeout: 30000 })
  .catch(() => {}).then(() => pause(400));
const shot = async (ms) => { frames.push({ png: await page.screenshot(), ms }); process.stdout.write('.'); };

// 1. The week: stats, five days, sessions, logos in monochrome
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await logos();
await shot(2600);

// 2. Hover brings a logo's colour back; click opens the company's numbers
const watched = page.locator('.tile--watch').first();
await watched.hover(); await pause(250); await shot(900);
await watched.click(); await pause(250); await shot(2800);
await page.keyboard.press('Escape'); await page.mouse.move(W - 20, H - 20);

// 3. Colour mode
await page.click('#colorToggle'); await logos(); await shot(2000);

// 4. Watchlist only
await page.click('#watchOnly'); await logos(); await shot(2200);
await page.click('#watchOnly');

// 5. Search as you type
await page.type('#search', 'bank', { delay: 80 }); await logos(); await shot(2200);
await page.fill('#search', '');
await page.click('#colorToggle'); await logos();

// 6. The busiest session, expanded
const more = page.locator('.more').first();
if (await more.count()) {
  await more.scrollIntoViewIfNeeded(); await more.click(); await logos();
  await page.evaluate(() => scrollBy(0, 260)); await logos(); await shot(2000);
  await page.evaluate(() => scrollTo(0, 0));
}

// 7. Weeks ahead, with the estimates notice
await page.click('#next'); await logos(); await shot(1500);
await page.click('#next'); await logos(); await shot(2200);

// 8. Dark theme, back on this week
await page.emulateMedia({ colorScheme: 'dark' });
await page.click('#today'); await logos(); await shot(2600);

await browser.close();

const gif = GIFEncoder();
for (const f of frames) {
  const { width, height, data } = PNG.sync.read(f.png);
  const palette = quantize(data, 128);
  gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: f.ms });
}
gif.finish();
writeFileSync(OUT, gif.bytes());
console.log(`\nWrote ${OUT}: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(1)} MB.`);
