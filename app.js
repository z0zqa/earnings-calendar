(() => {
  const DATA = window.EARNINGS ?? { days: {} };
  const CONFIG = window.CONFIG ?? { perSession: 9, watchlist: [] };
  const WATCH = new Set(CONFIG.watchlist);
  const params = new URLSearchParams(location.search);
  const SHOT = params.has('shot');

  const DOW = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt'];
  const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const SESSIONS = [
    { key: 'bmo', label: 'Przed otwarciem', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>' },
    { key: 'amc', label: 'Po zamknięciu', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z"/></svg>' },
    { key: 'tns', label: 'Godzina nieustalona', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.3 1.5"/></svg>' },
  ];
  const LOGOS = [
    (s) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`,
    (s) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(s)}?format=png`,
  ];

  const $ = (id) => document.getElementById(id);
  const iso = (d) => d.toISOString().slice(0, 10);
  const parseIso = (s) => new Date(`${s}T00:00:00Z`);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const todayIso = (() => { const n = new Date(); return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); })();
  const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
  const focusMonday = () => {
    const t = parseIso(todayIso), dow = t.getUTCDay();
    return addDays(mondayOf(t), dow === 0 || dow === 6 ? 7 : 0);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const fmtCap = (v) => v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)} bln` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)} mld` : `$${(v / 1e6).toFixed(0)} mln`;
  const fmtEps = (v) => v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  const fmtRange = (mon) => {
    const fri = addDays(mon, 4);
    const a = `${mon.getUTCDate()}${mon.getUTCMonth() === fri.getUTCMonth() ? '' : ' ' + MONTHS[mon.getUTCMonth()]}`;
    return `${a}–${fri.getUTCDate()} ${MONTHS[fri.getUTCMonth()]} ${fri.getUTCFullYear()}`;
  };

  const state = {
    monday: params.get('week') ? mondayOf(parseIso(params.get('week'))) : focusMonday(),
    query: '',
    watchOnly: false,
    color: false,
    expanded: new Set(),
  };
  try { state.color = localStorage.getItem('ec-color') === '1'; } catch {}

  const byKey = new Map();

  function filterRows(rows) {
    const q = state.query.trim().toLowerCase();
    return rows.filter((r) =>
      (!state.watchOnly || WATCH.has(r.s)) &&
      (!q || r.s.toLowerCase().includes(q) || r.n.toLowerCase().includes(q)));
  }

  function tile(r) {
    byKey.set(r.s, r);
    const watch = WATCH.has(r.s) ? ' tile--watch' : '';
    return `<button class="tile${watch}" data-s="${esc(r.s)}" title="${esc(r.n)}">
      <span class="tile__logo"><img alt="" crossorigin="anonymous" loading="${SHOT ? 'eager' : 'lazy'}" data-i="0" src="${LOGOS[0](r.s)}"></span>
      <span class="tile__ticker">${esc(r.s)}</span>
    </button>`;
  }

  function render() {
    document.body.classList.toggle('color', state.color);
    $('colorToggle').setAttribute('aria-pressed', state.color);
    $('watchOnly').setAttribute('aria-pressed', state.watchOnly);
    $('weekRange').textContent = `Tydzień ${fmtRange(state.monday)}`;
    byKey.clear();

    let total = 0, watchHits = [], biggest = null, busiest = null;
    const cols = [];
    for (let i = 0; i < 5; i++) {
      const date = iso(addDays(state.monday, i));
      const all = DATA.days[date];
      const rows = filterRows(all ?? []);
      total += (all ?? []).length;
      for (const r of all ?? []) {
        if (WATCH.has(r.s)) watchHits.push(r.s);
        if (r.mc && (!biggest || r.mc > biggest.mc)) biggest = r;
      }
      if (all && (!busiest || all.length > busiest.n)) busiest = { n: all.length, i };

      const sessions = SESSIONS.map((s) => {
        const list = rows.filter((r) => r.t === s.key);
        if (!list.length && s.key === 'tns') return '';
        const key = `${date}:${s.key}`;
        const limit = state.expanded.has(key) || state.query || state.watchOnly ? Infinity : CONFIG.perSession;
        const shown = list.slice(0, limit);
        const rest = list.length - shown.length;
        return `<section class="session session--${s.key}">
          <div class="session__head">${s.icon}<span>${s.label}</span><span class="session__n">${list.length}</span></div>
          ${list.length ? `<div class="grid">${shown.map(tile).join('')}</div>` : '<div class="empty">Brak publikacji</div>'}
          ${rest > 0 && !SHOT ? `<button class="more" data-k="${key}">+ ${rest} więcej</button>` : ''}
          ${!rest && state.expanded.has(key) ? `<button class="more" data-k="${key}">Zwiń</button>` : ''}
        </section>`;
      }).join('');

      const cls = date === todayIso ? ' day--today' : date < todayIso ? ' day--past' : '';
      const d = parseIso(date);
      cols.push(`<article class="day${cls}">
        <div class="day__head">
          <div><div class="day__dow">${DOW[i]}</div><div class="day__num">${d.getUTCDate()}</div></div>
          <div class="day__count">${all ? `${all.length} spółek` : 'brak danych'}</div>
        </div>${all ? sessions : ''}
      </article>`);
    }
    $('board').innerHTML = cols.join('');

    const weekDates = new Set(watchHits);
    $('stats').innerHTML = [
      ['Raportów w tygodniu', `${total}`],
      ['Największa spółka', biggest ? `${esc(biggest.s)} <small>${fmtCap(biggest.mc)}</small>` : '—'],
      ['Najgęstszy dzień', busiest ? `${DOW[busiest.i]} ${addDays(state.monday, busiest.i).getUTCDate()} <small>${busiest.n} spółek</small>` : '—'],
      ['Z watchlisty', weekDates.size ? `<span class="stat__value--sage">${weekDates.size}</span> <small>${[...weekDates].slice(0, 6).map(esc).join(' · ')}</small>` : '0'],
    ].map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`).join('');

    $('updated').textContent = DATA.updated
      ? `Zaktualizowano ${new Date(DATA.updated).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })}`
      : 'Brak danych — uruchom npm run fetch';
  }

  // Łańcuch logotypów: FMP → Parqet → monogram.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('.tile')) return;
    const s = img.closest('.tile').dataset.s;
    const next = Number(img.dataset.i) + 1;
    // Parqet nie wysyła nagłówków CORS, więc bez crossorigin.
    if (next < LOGOS.length) { img.removeAttribute('crossorigin'); img.dataset.i = next; img.src = LOGOS[next](s); return; }
    const mono = document.createElement('span');
    mono.className = 'tile__mono';
    mono.textContent = s.replace(/[^A-Z0-9]/g, '').slice(0, 4);
    img.replaceWith(mono);
  }, true);

  // Część logotypów FMP to białe znaki na przezroczystym tle — dostają ciemny kafelek.
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('.tile') || !img.crossOrigin) return;
    try {
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(img, 0, 0, 32, 32);
      const px = ctx.getImageData(0, 0, 32, 32).data;
      let n = 0, lum = 0, clear = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 40) { clear++; continue; }
        n++; lum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      }
      if (n && clear > 64 && lum / n > 215) img.parentElement.classList.add('tile__logo--light');
    } catch {}
  }, true);

  const pop = $('pop');
  function showPop(btn) {
    const r = byKey.get(btn.dataset.s);
    const diff = r.eps != null && r.ly != null && r.ly !== 0 ? (r.eps - r.ly) / Math.abs(r.ly) : null;
    pop.innerHTML = `<h3>${esc(r.s)}</h3><p class="pop__name">${esc(r.n)}</p><dl>
      <dt>Kapitalizacja</dt><dd>${fmtCap(r.mc)}</dd>
      <dt>Konsensus EPS</dt><dd>${fmtEps(r.eps)}</dd>
      <dt>EPS rok temu</dt><dd>${fmtEps(r.ly)}</dd>
      <dt>Zmiana r/r</dt><dd class="${diff == null ? '' : diff >= 0 ? 'pos' : 'neg'}">${diff == null ? '—' : `${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(0)}%`}</dd>
      <dt>Kwartał fiskalny</dt><dd>${esc(r.q ?? '—')}</dd>
      <dt>Liczba szacunków</dt><dd>${r.ne ?? '—'}</dd></dl>`;
    pop.hidden = false;
    const b = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.min(Math.max(8, b.left + b.width / 2 - w / 2), innerWidth - w - 8);
    const top = b.bottom + h + 12 < innerHeight ? b.bottom + 8 : Math.max(8, b.top - h - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    const more = e.target.closest('.more');
    if (more) {
      const k = more.dataset.k;
      state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k);
      render();
    }
    if (t) { showPop(t); return; }
    if (!e.target.closest('.pop')) pop.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pop.hidden = true;
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowLeft') go(-7);
    if (e.key === 'ArrowRight') go(7);
  });
  addEventListener('scroll', () => { pop.hidden = true; }, { passive: true });

  function go(days) {
    state.monday = days ? addDays(state.monday, days) : focusMonday();
    state.expanded.clear();
    const u = new URL(location.href);
    u.searchParams.set('week', iso(state.monday));
    history.replaceState(null, '', u);
    render();
  }
  $('prev').onclick = () => go(-7);
  $('next').onclick = () => go(7);
  $('today').onclick = () => go(0);
  $('search').oninput = (e) => { state.query = e.target.value; render(); };
  $('watchOnly').onclick = () => { state.watchOnly = !state.watchOnly; render(); };
  $('colorToggle').onclick = () => {
    state.color = !state.color;
    try { localStorage.setItem('ec-color', state.color ? '1' : '0'); } catch {}
    render();
  };

  if (SHOT) document.body.classList.add('shot');
  render();
})();
