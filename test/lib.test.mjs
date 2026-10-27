import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, parseRows, parseWeekArg, mondayOf, focusMonday, parseIso, iso, serialize } from '../scripts/lib.mjs';

test('money parses Nasdaq amounts', () => {
  assert.equal(money('$885,149,400,000'), 885149400000);
  assert.equal(money('$5.94'), 5.94);
  assert.equal(money('($0.12)'), -0.12);
  assert.equal(money('-$0.12'), -0.12);
  assert.equal(money('N/A'), null);
  assert.equal(money(''), null);
  assert.equal(money('$'), null);
});

test('parseRows maps sessions and sorts by market cap', () => {
  const rows = parseRows([
    { symbol: 'SMALL', name: 'Small', time: 'time-after-hours', marketCap: '$1,000', epsForecast: '$1', lastYearEPS: '', noOfEsts: '2' },
    { symbol: ' BIG ', name: 'Big', time: 'time-pre-market', marketCap: '$9,000', epsForecast: '($0.50)', lastYearEPS: '$0.40', noOfEsts: '' },
    { symbol: 'X', name: 'X', time: 'time-not-supplied', marketCap: 'N/A' },
    { name: 'no symbol' },
  ]);
  assert.deepEqual(rows.map((r) => [r.s, r.t]), [['BIG', 'bmo'], ['SMALL', 'amc'], ['X', 'tns']]);
  assert.equal(rows[0].eps, -0.5);
  assert.equal(rows[0].ne, null);
  assert.deepEqual(parseRows(null), []);
});

test('parseWeekArg accepts real dates only', () => {
  assert.equal(iso(parseWeekArg('2026-10-29')), '2026-10-26');
  for (const bad of ['abc', '2026-13-45', '2026-02-30', '2026-1-5', '', undefined, '2026-10-26; rm -rf /']) {
    assert.throws(() => parseWeekArg(bad), /YYYY-MM-DD/);
  }
});

test('mondayOf and focusMonday', () => {
  assert.equal(iso(mondayOf(parseIso('2026-11-01'))), '2026-10-26'); // Sunday → its Monday
  assert.equal(iso(focusMonday(new Date('2026-10-25T16:07:00Z'))), '2026-10-26'); // Sunday email → coming week
  assert.equal(iso(focusMonday(new Date('2026-10-28T12:00:00Z'))), '2026-10-26'); // midweek → this week
});

test('serialize round-trips through the browser script format', () => {
  const data = { updated: '2026-10-27T00:00:00.000Z', days: { '2026-10-26': [{ s: 'A', n: 'A "Inc"', t: 'bmo', mc: 1 }], '2026-10-27': [] } };
  const text = serialize(data);
  const window = {};
  new Function('window', text)(window);
  assert.deepEqual(window.EARNINGS, data);
  assert.ok(text.split('\n').length > 3, 'one company per line');
});

test('logo ink: free-standing white on transparency is the mark, an opaque plate is background', async () => {
  const { inkOf } = await import('../scripts/logos.mjs');
  const img = (w, h, px) => { const data = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) data.set(px(i % w, (i / w) | 0), i * 4); return { width: w, height: h, data }; };
  // White bar on transparency (like IBM's lettering): ink.
  const white = inkOf(img(20, 20, (x, y) => (y >= 8 && y < 12 ? [255, 255, 255, 255] : [0, 0, 0, 0])));
  assert.equal(white[10 * 20 + 10], 1);
  assert.equal(white[0], 0);
  // White bar on an opaque blue square (like Visa's): the bar is ink, the square is not.
  const visa = inkOf(img(20, 20, (x, y) => (y >= 8 && y < 12 ? [255, 255, 255, 255] : [20, 60, 200, 255])));
  assert.equal(visa[10 * 20 + 10], 1);
  assert.equal(visa[2 * 20 + 2], 0);
});
