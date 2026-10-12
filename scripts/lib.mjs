// Wspólne pomocnicze funkcje dat i danych dla skryptów Node.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_JSON = join(ROOT, 'data', 'earnings.json');
export const DATA_JS = join(ROOT, 'data', 'earnings.js');

export const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));

// Daty jako 'YYYY-MM-DD' liczone w UTC, żeby nie zależeć od strefy runnera.
export const iso = (d) => d.toISOString().slice(0, 10);
export const parseIso = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

export function mondayOf(d) {
  const dow = (d.getUTCDay() + 6) % 7; // pon = 0
  return addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -dow);
}

// W weekend „ten tydzień” to nadchodzący tydzień.
export function focusMonday(now = new Date()) {
  const dow = now.getUTCDay();
  const m = mondayOf(now);
  return dow === 0 || dow === 6 ? addDays(m, 7) : m;
}

export function loadData() {
  if (!existsSync(DATA_JSON)) return { updated: null, days: {} };
  return JSON.parse(readFileSync(DATA_JSON, 'utf8'));
}

export function saveData(data) {
  const json = JSON.stringify(data);
  writeFileSync(DATA_JSON, json + '\n');
  // Plik .js pozwala otworzyć index.html prosto z dysku (bez serwera).
  writeFileSync(DATA_JS, `window.EARNINGS = ${json};\n`);
  const { perSession, watchlist } = config;
  writeFileSync(join(ROOT, 'config.js'),
    `// Generowane przez skrypty z config.json — nie edytuj ręcznie.\nwindow.CONFIG = ${JSON.stringify({ perSession, watchlist })};\n`);
}
