// Pobiera kalendarz wyników z Nasdaq (bez klucza API) i zapisuje data/earnings.{json,js}.
// Użycie: node scripts/fetch.mjs [YYYY-MM-DD]  (data dowolnego dnia w tygodniu, wokół którego pobieramy)
import { config, loadData, saveData, focusMonday, mondayOf, parseIso, addDays, iso } from './lib.mjs';

const TIME = { 'time-pre-market': 'bmo', 'time-after-hours': 'amc' };

const money = (s) => {
  if (!s || /n\/a/i.test(s)) return null;
  const neg = s.includes('(') || s.includes('-');
  const v = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) && s.match(/\d/) ? (neg ? -v : v) : null;
};

async function fetchDay(date, attempt = 1) {
  const url = `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return (body?.data?.rows ?? []).map((r) => ({
      s: r.symbol.trim(),
      n: r.name.trim(),
      t: TIME[r.time] ?? 'tns',
      mc: money(r.marketCap),
      eps: money(r.epsForecast),
      ly: money(r.lastYearEPS),
      q: r.fiscalQuarterEnding || null,
      ne: Number(r.noOfEsts) || null,
    })).sort((a, b) => (b.mc ?? 0) - (a.mc ?? 0));
  } catch (err) {
    if (attempt >= 4) throw new Error(`${date}: ${err.message}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return fetchDay(date, attempt + 1);
  }
}

const anchor = process.argv[2] ? mondayOf(parseIso(process.argv[2])) : focusMonday();
const first = addDays(anchor, -7 * config.weeksBack);
const last = addDays(anchor, 7 * (config.weeksAhead + 1));

const data = loadData();
let fetched = 0;
let failed = 0;
for (let d = first; d < last; d = addDays(d, 1)) {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const date = iso(d);
  try {
    data.days[date] = await fetchDay(date);
    fetched++;
    console.log(`${date}  ${String(data.days[date].length).padStart(4)} spółek`);
  } catch (err) {
    failed++;
    console.warn(`! ${err.message} — zostawiam poprzednie dane`);
  }
}

// Usuń dni starsze niż keepWeeks tygodni.
const cutoff = iso(addDays(anchor, -7 * config.keepWeeks));
for (const date of Object.keys(data.days)) if (date < cutoff) delete data.days[date];
data.days = Object.fromEntries(Object.entries(data.days).sort(([a], [b]) => a.localeCompare(b)));
data.updated = new Date().toISOString();

if (!fetched) {
  console.error('Nie udało się pobrać żadnego dnia.');
  process.exit(1);
}
saveData(data);
console.log(`Zapisano ${fetched} dni${failed ? `, ${failed} błędów` : ''}.`);
