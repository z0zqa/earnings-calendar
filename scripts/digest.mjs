// Sunday digest: a screenshot of the week from the app plus an email with the key companies.
// Usage: node scripts/digest.mjs [--dry-run] [--week YYYY-MM-DD]
// Env: SMTP_USER, SMTP_PASS, MAIL_TO (defaults to SMTP_USER), SMTP_HOST (defaults to smtp.gmail.com),
//      SMTP_PORT (465), APP_URL (optional link to the app in the email).
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

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SESSION = { bmo: 'before open', amc: 'after close', tns: 'time not supplied' };
// Option Toolkit palette: midnight navy, graphite, slate ink, cool mist, eucalyptus.
const C = { navy: '#172236', ink: '#252A31', muted: '#56657A', silver: '#B7BEC7', mist: '#EEF1F3', ground: '#F7F9FA', line: '#D5DBE1', accent: '#52736D', accentInk: '#43615B' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cap = (v) => v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`;
const eps = (v) => v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
const fri = addDays(monday, 4);
const range = `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}–${monday.getUTCMonth() === fri.getUTCMonth() ? '' : MONTHS[fri.getUTCMonth()] + ' '}${fri.getUTCDate()}, ${fri.getUTCFullYear()}`;

// ---- data summary ----
const data = loadData();
const watch = new Set(config.watchlist);
const days = [...Array(5)].map((_, i) => {
  const date = iso(addDays(monday, i));
  return { i, date, rows: data.days[date] ?? [] };
});
const all = days.flatMap((d) => d.rows.map((r) => ({ ...r, day: d.i })));
if (!all.length) {
  console.error(`No data for the week of ${week}. Run npm run fetch first.`);
  process.exit(1);
}
const top = [...all].filter((r) => r.mc).sort((a, b) => b.mc - a.mc).slice(0, 10);
const hits = all.filter((r) => watch.has(r.s)).sort((a, b) => a.day - b.day || a.t.localeCompare(b.t));
const busiest = days.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));

// ---- app screenshot ----
mkdirSync(join(ROOT, 'out'), { recursive: true });
const shotPath = join(ROOT, 'out', `week-${week}.png`);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 2 });
  const url = `${pathToFileURL(join(ROOT, 'index.html')).href}?week=${week}&shot=1`;
  await page.goto(url, { waitUntil: 'load' });
  // Wait until every logo has loaded or fallen back to a monogram.
  await page.waitForFunction(() => [...document.querySelectorAll('.tile img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 })
    .catch(() => console.warn('! Some logos did not load within 30 s'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('body').screenshot({ path: shotPath });
} finally {
  await browser.close();
}
console.log(`Screenshot: ${shotPath}`);

// ---- email body ----
const th = `style="text-align:left;padding:8px 0;border-bottom:1px solid ${C.navy};font-size:12.5px;color:${C.muted};font-weight:700;border-bottom-color:${C.navy}"`;
const td = (extra = '') => `style="padding:7px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.ink};${extra}"`;
const row = (r) => `<tr>
  <td ${td(`font-weight:700;color:${watch.has(r.s) ? C.accentInk : C.navy};width:70px`)}>${esc(r.s)}</td>
  <td ${td(`color:${C.muted}`)}>${esc(r.n)}</td>
  <td ${td('white-space:nowrap')}>${DOW_SHORT[r.day]} · ${SESSION[r.t]}</td>
  <td ${td('text-align:right;white-space:nowrap')}>${cap(r.mc)}</td>
  <td ${td('text-align:right;white-space:nowrap;padding-left:12px')}>${eps(r.eps)}</td></tr>`;
const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr><th ${th}>Ticker</th><th ${th}>Company</th><th ${th}>When</th><th ${th.replace('left', 'right')}>Market cap</th><th ${th.replace('left', 'right')}>EPS consensus</th></tr>
  ${rows.map(row).join('')}</table>`;
const h2 = (t) => `<h2 style="margin:32px 0 8px;padding-top:12px;border-top:1px solid ${C.line};font-size:16.5px;color:${C.navy};font-weight:700"><span style="display:inline-block;width:24px;height:3px;background:${C.accent};vertical-align:middle;margin-right:10px"></span>${t}</h2>`;

const dayLines = days.map((d) => {
  const best = (t) => d.rows.filter((r) => r.t === t).slice(0, 5).map((r) => `<b>${esc(r.s)}</b>`).join(', ') || '—';
  return `<tr><td ${td(`font-weight:700;width:120px;vertical-align:top`)}>${DOW[d.i]}<br><span style="font-weight:400;color:${C.muted};font-size:12px">${d.rows.length} companies</span></td>
    <td ${td('vertical-align:top')}><span style="color:${C.accentInk};font-size:12px">Before open:</span> ${best('bmo')}<br>
    <span style="color:${C.muted};font-size:12px">After close:</span> ${best('amc')}</td></tr>`;
}).join('');

const appUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/?week=${week}` : null;
const html = `<!doctype html><html lang="en"><body style="margin:0;background:${C.ground};font-family:Archivo,Arial,Helvetica,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%">
<tr><td style="background:${C.navy};padding:20px 24px">
  <div style="font-size:15px;font-weight:700;color:${C.mist}"><span style="color:${C.silver}">Earnings</span> Calendar</div>
  <div style="margin-top:4px;font-size:26px;line-height:1.2;font-weight:600;color:${C.mist};letter-spacing:-.01em">Week of ${range}</div>
</td></tr>
<tr><td style="padding:24px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${[['Reports', all.length], ['Busiest day', `${DOW[busiest.i]} (${busiest.rows.length})`], ['From watchlist', hits.length]].map(([l, v], i) =>
      `<td style="padding:10px 12px 0 0;border-top:1px solid ${C.line};vertical-align:top;width:33%">
        <div style="font-size:12.5px;color:${C.muted};font-weight:700">${l}</div>
        <div style="font-size:26px;font-weight:600;color:${i === 2 ? C.accentInk : C.navy}">${v}</div></td>`).join('')}
  </tr></table>
</td></tr>
<tr><td>
  ${hits.length ? h2('On your watchlist') + table(hits) : ''}
  ${h2('Largest companies this week') + table(top)}
  ${h2('Day by day') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${dayLines}</table>`}
  ${h2('Calendar')}
  <img src="cid:calendar" alt="Earnings calendar, week of ${range}" width="680" style="display:block;width:100%;height:auto;border:1px solid ${C.line}">
  ${appUrl ? `<p style="margin:20px 0 0"><a href="${appUrl}" style="display:inline-block;background:${C.navy};color:${C.mist};text-decoration:none;padding:10px 18px;border-radius:2px;font-size:14px;font-weight:600">Open the app →</a></p>` : ''}
  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid ${C.line};font-size:12.5px;color:${C.muted}">Data: Nasdaq. Times are US Eastern; dates can still change. Full-resolution screenshot attached.</p>
</td></tr></table></td></tr></table></body></html>`;

const text = [
  `Earnings — week of ${range}`,
  `${all.length} reports. Busiest day: ${DOW[busiest.i]} (${busiest.rows.length}).`,
  hits.length ? `\nOn your watchlist:\n${hits.map((r) => `  ${r.s} — ${DOW[r.day]}, ${SESSION[r.t]}`).join('\n')}` : '',
  `\nLargest companies:\n${top.map((r) => `  ${r.s} (${r.n}) — ${DOW[r.day]}, ${SESSION[r.t]}`).join('\n')}`,
  appUrl ? `\n${appUrl}` : '',
].join('\n');

const subject = `Earnings · ${range} · ${all.length} reports${hits.length ? ` · watchlist: ${hits.slice(0, 4).map((r) => r.s).join(', ')}` : ''}`;
writeFileSync(join(ROOT, 'out', 'digest.html'), html.replace('cid:calendar', `week-${week}.png`));

const { SMTP_USER, SMTP_PASS } = process.env;
if (dryRun || !SMTP_USER || !SMTP_PASS) {
  console.log(`${dryRun ? 'Dry run' : 'SMTP_USER/SMTP_PASS not set'} — email saved to out/digest.html, not sent.\nSubject: ${subject}`);
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
  from: `Earnings Calendar <${SMTP_USER}>`,
  to: process.env.MAIL_TO || SMTP_USER,
  subject,
  text,
  html,
  attachments: [
    { filename: `earnings-${week}.png`, path: shotPath, cid: 'calendar' },
  ],
});
console.log(`Sent: ${info.messageId}`);
