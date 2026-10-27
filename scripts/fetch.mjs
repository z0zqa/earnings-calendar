// Fetches the earnings calendar from Nasdaq (no API key) and writes data/earnings.js.
// Usage: node scripts/fetch.mjs [YYYY-MM-DD]  (any day in the week to fetch around)
import { config, loadData, saveData, focusMonday, parseWeekArg, addDays, iso, parseRows } from './lib.mjs';

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
    return parseRows(body?.data?.rows);
  } catch (err) {
    if (attempt >= 4) throw new Error(`${date}: ${err.message}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return fetchDay(date, attempt + 1);
  }
}

const anchor = process.argv[2] ? parseWeekArg(process.argv[2]) : focusMonday();
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
    const rows = await fetchDay(date);
    // An empty answer for a day that had many reports is a Nasdaq hiccup, not a cancelled day.
    if (!rows.length && (data.days[date]?.length ?? 0) > 20) throw new Error(`${date}: empty response`);
    data.days[date] = rows;
    fetched++;
    console.log(`${date}  ${String(data.days[date].length).padStart(4)} companies`);
  } catch (err) {
    failed++;
    console.warn(`! ${err.message} — keeping previous data`);
  }
}

// Drop days older than keepWeeks weeks.
const cutoff = iso(addDays(anchor, -7 * config.keepWeeks));
for (const date of Object.keys(data.days)) if (date < cutoff) delete data.days[date];
data.days = Object.fromEntries(Object.entries(data.days).sort(([a], [b]) => a.localeCompare(b)));
data.updated = new Date().toISOString();

if (!fetched) {
  console.error('Could not fetch any day.');
  process.exit(1);
}
saveData(data);
console.log(`Saved ${fetched} days${failed ? `, ${failed} failed` : ''}.`);
