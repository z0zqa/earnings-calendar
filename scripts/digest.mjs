// Niedzielne podsumowanie: zrzut tygodnia z aplikacji + mail z najważniejszymi spółkami.
// Użycie: node scripts/digest.mjs [--dry-run] [--week YYYY-MM-DD]
// Zmienne: SMTP_USER, SMTP_PASS, MAIL_TO (domyślnie SMTP_USER), SMTP_HOST (domyślnie smtp.gmail.com),
//          SMTP_PORT (465), APP_URL (link do aplikacji w mailu, opcjonalny).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import nodemailer from 'nodemailer';
import { ROOT, config, loadData, focusMonday, mondayOf, parseIso, addDays, iso } from './lib.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const weekArg = args.includes('--week') ? args[args.indexOf('--week') + 1] : null;
const monday = weekArg ? mondayOf(parseIso(weekArg)) : focusMonday();
const week = iso(monday);

const DOW = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];
const DOW_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt'];
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const SESSION = { bmo: 'przed otwarciem', amc: 'po zamknięciu', tns: 'godz. nieustalona' };
// Paleta Option Toolkit: midnight navy, graphite, slate ink, cool mist, eucalyptus.
const C = { navy: '#172236', ink: '#252A31', muted: '#56657A', silver: '#B7BEC7', mist: '#EEF1F3', ground: '#F7F9FA', line: '#D5DBE1', accent: '#52736D', accentInk: '#43615B' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cap = (v) => v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)} bln` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)} mld` : `$${(v / 1e6).toFixed(0)} mln`;
const eps = (v) => v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
const fri = addDays(monday, 4);
const range = `${monday.getUTCDate()}${monday.getUTCMonth() === fri.getUTCMonth() ? '' : ' ' + MONTHS[monday.getUTCMonth()]}–${fri.getUTCDate()} ${MONTHS[fri.getUTCMonth()]} ${fri.getUTCFullYear()}`;

// ---- podsumowanie danych ----
const data = loadData();
const watch = new Set(config.watchlist);
const days = [...Array(5)].map((_, i) => {
  const date = iso(addDays(monday, i));
  return { i, date, rows: data.days[date] ?? [] };
});
const all = days.flatMap((d) => d.rows.map((r) => ({ ...r, day: d.i })));
if (!all.length) {
  console.error(`Brak danych dla tygodnia ${week}. Uruchom najpierw npm run fetch.`);
  process.exit(1);
}
const top = [...all].filter((r) => r.mc).sort((a, b) => b.mc - a.mc).slice(0, 10);
const hits = all.filter((r) => watch.has(r.s)).sort((a, b) => a.day - b.day || a.t.localeCompare(b.t));
const busiest = days.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));

// ---- zrzut ekranu aplikacji ----
mkdirSync(join(ROOT, 'out'), { recursive: true });
const shotPath = join(ROOT, 'out', `tydzien-${week}.png`);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 2 });
  const url = `${pathToFileURL(join(ROOT, 'index.html')).href}?week=${week}&shot=1`;
  await page.goto(url, { waitUntil: 'load' });
  // Poczekaj, aż każde logo się wczyta albo spadnie do monogramu.
  await page.waitForFunction(() => [...document.querySelectorAll('.tile img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 })
    .catch(() => console.warn('! Część logotypów nie wczytała się w 30 s'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('body').screenshot({ path: shotPath });
} finally {
  await browser.close();
}
console.log(`Zrzut: ${shotPath}`);

// ---- treść maila ----
const th = `style="text-align:left;padding:8px 0;border-bottom:1px solid ${C.navy};font-size:12.5px;color:${C.muted};font-weight:700;border-bottom-color:${C.navy}"`;
const td = (extra = '') => `style="padding:7px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.ink};${extra}"`;
const row = (r) => `<tr>
  <td ${td(`font-weight:700;color:${watch.has(r.s) ? C.accentInk : C.navy};width:70px`)}>${esc(r.s)}</td>
  <td ${td(`color:${C.muted}`)}>${esc(r.n)}</td>
  <td ${td('white-space:nowrap')}>${DOW_SHORT[r.day]} · ${SESSION[r.t]}</td>
  <td ${td('text-align:right;white-space:nowrap')}>${cap(r.mc)}</td>
  <td ${td('text-align:right;white-space:nowrap;padding-left:12px')}>${eps(r.eps)}</td></tr>`;
const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr><th ${th}>Ticker</th><th ${th}>Spółka</th><th ${th}>Kiedy</th><th ${th.replace('left', 'right')}>Kapitalizacja</th><th ${th.replace('left', 'right')}>EPS (konsensus)</th></tr>
  ${rows.map(row).join('')}</table>`;
const h2 = (t) => `<h2 style="margin:32px 0 8px;padding-top:12px;border-top:1px solid ${C.line};font-size:16.5px;color:${C.navy};font-weight:700"><span style="display:inline-block;width:24px;height:3px;background:${C.accent};vertical-align:middle;margin-right:10px"></span>${t}</h2>`;

const dayLines = days.map((d) => {
  const best = (t) => d.rows.filter((r) => r.t === t).slice(0, 5).map((r) => `<b>${esc(r.s)}</b>`).join(', ') || '—';
  return `<tr><td ${td(`font-weight:700;width:120px;vertical-align:top`)}>${DOW[d.i]}<br><span style="font-weight:400;color:${C.muted};font-size:12px">${d.rows.length} spółek</span></td>
    <td ${td('vertical-align:top')}><span style="color:${C.accentInk};font-size:12px">Przed otwarciem:</span> ${best('bmo')}<br>
    <span style="color:${C.muted};font-size:12px">Po zamknięciu:</span> ${best('amc')}</td></tr>`;
}).join('');

const appUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/?week=${week}` : null;
const html = `<!doctype html><html lang="pl"><body style="margin:0;background:${C.ground};font-family:Archivo,Arial,Helvetica,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%">
<tr><td style="background:${C.navy};padding:20px 24px">
  <div style="font-size:15px;font-weight:700;color:${C.mist}"><span style="color:${C.silver}">Earnings</span> Kalendarz wyników</div>
  <div style="margin-top:4px;font-size:26px;line-height:1.2;font-weight:600;color:${C.mist};letter-spacing:-.01em">Tydzień ${range}</div>
</td></tr>
<tr><td style="padding:24px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${[['Raportów', all.length], ['Najgęstszy dzień', `${DOW[busiest.i]} (${busiest.rows.length})`], ['Z watchlisty', hits.length]].map(([l, v], i) =>
      `<td style="padding:10px 12px 0 0;border-top:1px solid ${C.line};vertical-align:top;width:33%">
        <div style="font-size:12.5px;color:${C.muted};font-weight:700">${l}</div>
        <div style="font-size:26px;font-weight:600;color:${i === 2 ? C.accentInk : C.navy}">${v}</div></td>`).join('')}
  </tr></table>
</td></tr>
<tr><td>
  ${hits.length ? h2('Z Twojej watchlisty') + table(hits) : ''}
  ${h2('Największe spółki tygodnia') + table(top)}
  ${h2('Dzień po dniu') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${dayLines}</table>`}
  ${h2('Kalendarz')}
  <img src="cid:kalendarz" alt="Kalendarz wyników ${range}" width="680" style="display:block;width:100%;height:auto;border:1px solid ${C.line}">
  ${appUrl ? `<p style="margin:20px 0 0"><a href="${appUrl}" style="display:inline-block;background:${C.navy};color:${C.mist};text-decoration:none;padding:10px 18px;border-radius:2px;font-size:14px;font-weight:600">Otwórz aplikację →</a></p>` : ''}
  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid ${C.line};font-size:12.5px;color:${C.muted}">Dane: Nasdaq. Godziny wg czasu nowojorskiego; daty mogą się jeszcze zmienić. Zrzut w pełnej rozdzielczości w załączniku.</p>
</td></tr></table></td></tr></table></body></html>`;

const text = [
  `Earnings — tydzień ${range}`,
  `${all.length} raportów. Najgęstszy dzień: ${DOW[busiest.i]} (${busiest.rows.length}).`,
  hits.length ? `\nZ watchlisty:\n${hits.map((r) => `  ${r.s} — ${DOW[r.day]}, ${SESSION[r.t]}`).join('\n')}` : '',
  `\nNajwiększe spółki:\n${top.map((r) => `  ${r.s} (${r.n}) — ${DOW[r.day]}, ${SESSION[r.t]}`).join('\n')}`,
  appUrl ? `\n${appUrl}` : '',
].join('\n');

const subject = `Earnings · ${range} · ${all.length} raportów${hits.length ? ` · watchlista: ${hits.slice(0, 4).map((r) => r.s).join(', ')}` : ''}`;
writeFileSync(join(ROOT, 'out', 'digest.html'), html.replace('cid:kalendarz', `tydzien-${week}.png`));

const { SMTP_USER, SMTP_PASS } = process.env;
if (dryRun || !SMTP_USER || !SMTP_PASS) {
  console.log(`${dryRun ? 'Tryb próbny' : 'Brak SMTP_USER/SMTP_PASS'} — mail zapisany w out/digest.html, nie wysłano.\nTemat: ${subject}`);
  if (!dryRun && process.env.CI) process.exit(1);
  process.exit(0);
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});
const info = await transport.sendMail({
  from: `Kalendarz wyników <${SMTP_USER}>`,
  to: process.env.MAIL_TO || SMTP_USER,
  subject,
  text,
  html,
  attachments: [
    { filename: `kalendarz-${week}.png`, path: shotPath, cid: 'kalendarz' },
  ],
});
console.log(`Wysłano: ${info.messageId}`);
