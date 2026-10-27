// Loads index.html in Chromium against the committed data and checks the app's behaviour end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, loadData, mondayOf, parseIso, iso } from '../scripts/lib.mjs';

// The committed data rolls forward every day, so tests use its busiest week rather than a fixed date.
const weeks = {};
for (const [date, rows] of Object.entries(loadData().days)) {
  const m = iso(mondayOf(parseIso(date)));
  weeks[m] = (weeks[m] ?? 0) + rows.length;
}
const WEEK = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0][0];

const BASE = pathToFileURL(join(ROOT, 'index.html')).href;
let browser;
before(async () => { browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); });
after(() => browser?.close());

async function open(query = '', opts = {}) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Logos are not under test; serve them nothing so the run is offline and fast.
  await page.route(/financialmodelingprep|parqet|fonts\.g/, (r) => r.abort());
  await page.goto(BASE + query);
  return { page, errors };
}

test('renders a week of five days with tiles and stats', async () => {
  const { page, errors } = await open(`?week=${WEEK}`);
  assert.deepEqual(errors, []);
  assert.equal(await page.locator('.day').count(), 5);
  assert.ok(await page.locator('.tile').count() > 20);
  assert.doesNotMatch(await page.textContent('#weekRange'), /NaN|undefined/);
  assert.match(await page.textContent('#stats'), /Reports this week/);
});

test('invalid week parameters fall back to the current week', async () => {
  for (const q of ['?week=abc', '?week=2026-13-45', '?week=2026-02-30']) {
    const { page, errors } = await open(q);
    assert.deepEqual(errors, [], q);
    assert.doesNotMatch(await page.textContent('#weekRange'), /NaN|undefined/, q);
  }
});

test('missing logos fall back to a monogram', async () => {
  const { page } = await open(`?week=${WEEK}`);
  await page.waitForFunction(() => !document.querySelector('.tile img'));
  assert.ok(await page.locator('.tile__mono').count() > 20);
});

test('company details open with Enter and close with Escape, returning focus', async () => {
  const { page } = await open(`?week=${WEEK}`);
  const first = page.locator('.tile').first();
  const ticker = await first.getAttribute('data-s');
  await first.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.isHidden('#pop'), false);
  assert.equal(await page.textContent('#popTitle'), ticker);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pop');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#pop'), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.s), ticker);
});

test('search, watchlist filter and "more" expand', async () => {
  const { page } = await open(`?week=${WEEK}`);
  // Searching for the first company's full name shows that company and little else.
  const s = await page.locator('.tile').first().getAttribute('data-s');
  const n = await page.evaluate((t) => Object.values(window.EARNINGS.days).flat().find((r) => r.s === t).n, s);
  await page.fill('#search', n.toLowerCase());
  const found = await page.locator('.tile').evaluateAll((t) => t.map((x) => x.dataset.s));
  assert.ok(found.includes(s), `${s} in ${found}`);
  assert.ok(found.length < 10, `${found.length} results`);
  await page.fill('#search', '');
  await page.click('#watchOnly');
  const watch = await page.evaluate(() => window.CONFIG.watchlist);
  for (const s of await page.locator('.tile').evaluateAll((t) => t.map((x) => x.dataset.s))) assert.ok(watch.includes(s), s);
  await page.click('#watchOnly');
  const before = await page.locator('.tile').count();
  await page.locator('.more').first().click();
  assert.ok(await page.locator('.tile').count() > before);
});

test('today follows New York, not the viewer clock', async () => {
  const page = await browser.newPage({ timezoneId: 'Europe/Warsaw' });
  await page.clock.setFixedTime(new Date('2026-10-27T23:30:00Z')); // Wed 00:30 in Warsaw, Tue 19:30 in New York
  await page.route(/financialmodelingprep|parqet|fonts\.g/, (r) => r.abort());
  await page.goto(BASE + '?week=2026-10-26');
  assert.equal(await page.textContent('.day--today .day__dow'), 'Tue');
});

test('stale data and far-ahead weeks show a notice', async () => {
  const page = await browser.newPage();
  await page.clock.setFixedTime(new Date('2030-01-08T12:00:00Z'));
  await page.route(/financialmodelingprep|parqet|fonts\.g/, (r) => r.abort());
  await page.goto(BASE);
  assert.match(await page.textContent('#notice'), /days old/);
  const fresh = await browser.newPage();
  await fresh.addInitScript(() => { Object.defineProperty(window, 'EARNINGS', { set(v) { v.updated = new Date().toISOString(); this._e = v; }, get() { return this._e; } }); });
  await fresh.route(/financialmodelingprep|parqet|fonts\.g/, (r) => r.abort());
  await fresh.goto(BASE);
  assert.equal(await fresh.isHidden('#notice'), true);
  await fresh.click('#next'); await fresh.click('#next');
  assert.match(await fresh.textContent('#notice'), /estimates/);
});
