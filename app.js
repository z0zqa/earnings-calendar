(() => {
  const DATA = window.EARNINGS ?? { days: {} };
  const CONFIG = window.CONFIG ?? { perSession: 9, watchlist: [] };
  const WATCH = new Set(CONFIG.watchlist);
  const params = new URLSearchParams(location.search);
  const SHOT = params.has('shot');
  const AUDIT = params.has('audit');

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SESSIONS = [
    { key: 'bmo', label: 'Before open', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>' },
    { key: 'amc', label: 'After close', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z"/></svg>' },
    { key: 'tns', label: 'Time not supplied', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.3 1.5"/></svg>' },
  ];
  // Logos: the navy mark built by scripts/logos.mjs (logos/), and the brand's original from the same source for
  // hover and colour mode. Tickers without a usable logo get a monogram.
  const LOGOS = window.LOGOS ?? {};
  const OVERRIDES = CONFIG.logoOverrides ?? {};
  const ORIGINAL = {
    fmp: (t) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t)}.png`,
    parqet: (t) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(t)}?format=png`,
    override: (t) => OVERRIDES[t],
  };
  const markFile = (t) => `logos/${t.replace(/[^A-Z0-9.-]/gi, '_')}.png`;
  const monogram = (t) => `<span class="tile__mono">${esc(t.replace(/[^A-Z0-9]/g, '').slice(0, 4))}</span>`;

  const $ = (id) => document.getElementById(id);
  const iso = (d) => d.toISOString().slice(0, 10);
  const parseIso = (s) => new Date(`${s}T00:00:00Z`);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  // Report dates are New York dates, so "today" is too (after midnight in Warsaw, US companies are still reporting).
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const parseWeek = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return null;
    const d = parseIso(s);
    return Number.isNaN(d.getTime()) || iso(d) !== s ? null : mondayOf(d);
  };
  const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
  const focusMonday = () => {
    const t = parseIso(todayIso), dow = t.getUTCDay();
    return addDays(mondayOf(t), dow === 0 || dow === 6 ? 7 : 0);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const fmtCap = (v) => v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
  const fmtEps = (v) => v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  const fmtRange = (mon) => {
    const fri = addDays(mon, 4);
    const b = `${mon.getUTCMonth() === fri.getUTCMonth() ? '' : MONTHS[fri.getUTCMonth()] + ' '}${fri.getUTCDate()}`;
    return `${MONTHS[mon.getUTCMonth()]} ${mon.getUTCDate()}–${b}, ${fri.getUTCFullYear()}`;
  };

  const state = {
    monday: parseWeek(params.get('week')) ?? focusMonday(),
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
    const src = LOGOS[r.s]?.src ?? 'none';
    const loading = SHOT || AUDIT ? 'eager' : 'lazy';
    const img = src === 'none' ? monogram(r.s)
      : `<img class="tile__mark" alt="" loading="${loading}" src="${esc(markFile(r.s))}">`
        + `<img class="tile__orig" alt="" loading="${loading}" data-orig="${esc(ORIGINAL[src](r.s))}"${state.color ? ` src="${esc(ORIGINAL[src](r.s))}"` : ''}>`;
    return `<button class="tile${watch}" data-s="${esc(r.s)}" data-src="${src}" title="${esc(r.n)}">
      <span class="tile__logo">${img}</span>
      <span class="tile__ticker">${esc(r.s)}</span>
    </button>`;
  }

  function render() {
    if (AUDIT) { renderAudit(); updateAuditFlags(); return; }
    document.body.classList.toggle('color', state.color);
    $('colorToggle').setAttribute('aria-pressed', state.color);
    $('watchOnly').setAttribute('aria-pressed', state.watchOnly);
    $('weekRange').textContent = `Week of ${fmtRange(state.monday)}`;
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
          ${list.length ? `<div class="grid">${shown.map(tile).join('')}</div>` : '<div class="empty">No reports</div>'}
          ${rest > 0 && !SHOT ? `<button class="more" data-k="${key}">+ ${rest} more</button>` : ''}
          ${!rest && state.expanded.has(key) ? `<button class="more" data-k="${key}">Show less</button>` : ''}
        </section>`;
      }).join('');

      const cls = date === todayIso ? ' day--today' : date < todayIso ? ' day--past' : '';
      const d = parseIso(date);
      cols.push(`<article class="day${cls}">
        <div class="day__head">
          <div><div class="day__dow">${DOW[i]}</div><div class="day__num">${d.getUTCDate()}</div></div>
          <div class="day__count">${all ? `${all.length} ${all.length === 1 ? 'company' : 'companies'}` : 'no data'}</div>
        </div>${all ? sessions : ''}
      </article>`);
    }
    $('board').innerHTML = cols.join('');

    const weekDates = new Set(watchHits);
    $('stats').innerHTML = [
      ['Reports this week', `${total}`],
      ['Largest company', biggest ? `${esc(biggest.s)} <small>${fmtCap(biggest.mc)}</small>` : '—'],
      ['Busiest day', busiest ? `${DOW[busiest.i]} ${addDays(state.monday, busiest.i).getUTCDate()} <small>${busiest.n} companies</small>` : '—'],
      ['From watchlist', weekDates.size ? `<span class="stat__value--accent">${weekDates.size}</span> <small>${[...weekDates].slice(0, 6).map(esc).join(' · ')}</small>` : '0'],
    ].map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`).join('');

    renderNotice();
    $('updated').textContent = DATA.updated
      ? `Updated ${new Date(DATA.updated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
      : 'No data yet — run npm run fetch';
  }

  // Warn when the data is stale, and when the week is far enough ahead that Nasdaq's dates are still estimates.
  function renderNotice() {
    const notes = [];
    const age = DATA.updated ? Math.floor((Date.now() - new Date(DATA.updated)) / 86400000) : null;
    if (age != null && age >= 2) notes.push(`Data is ${age} days old, so some report dates may have moved since.`);
    if (!SHOT && state.monday - focusMonday() >= 14 * 86400000) notes.push('Dates this far ahead are Nasdaq estimates and often change.');
    $('notice').hidden = !notes.length;
    $('notice').textContent = notes.join(' ');
  }

  // The original logo loads on first hover or focus (or up front in colour mode); if it fails, the mark stays.
  const showOriginal = (e) => {
    const o = e.target.closest?.('.tile')?.querySelector('.tile__orig:not([src])');
    if (o) o.src = o.dataset.orig;
  };
  document.addEventListener('pointerover', showOriginal);
  document.addEventListener('focusin', showOriginal);
  document.addEventListener('error', (e) => {
    if (e.target.classList?.contains('tile__orig')) e.target.remove();
    else if (e.target.classList?.contains('tile__mark')) e.target.closest('.tile__logo').innerHTML = monogram(e.target.closest('.tile').dataset.s);
  }, true);

  const pop = $('pop');
  function showPop(btn) {
    const r = byKey.get(btn.dataset.s);
    const diff = r.eps != null && r.ly != null && r.ly !== 0 ? (r.eps - r.ly) / Math.abs(r.ly) : null;
    pop.innerHTML = `<h3 id="popTitle">${esc(r.s)}</h3><p class="pop__name">${esc(r.n)}</p><dl>
      <dt>Market cap</dt><dd>${fmtCap(r.mc)}</dd>
      <dt>EPS consensus</dt><dd>${fmtEps(r.eps)}</dd>
      <dt>EPS a year ago</dt><dd>${fmtEps(r.ly)}</dd>
      <dt>Change y/y</dt><dd class="${diff == null ? '' : diff >= 0 ? 'pos' : 'neg'}">${diff == null ? '—' : `${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(0)}%`}</dd>
      <dt>Fiscal quarter</dt><dd>${esc(r.q ?? '—')}</dd>
      <dt>Estimates</dt><dd>${r.ne ?? '—'}</dd></dl>`;
    pop.hidden = false;
    const b = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.min(Math.max(8, b.left + b.width / 2 - w / 2), innerWidth - w - 8);
    const top = b.bottom + h + 12 < innerHeight ? b.bottom + 8 : Math.max(8, b.top - h - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    popOpener = btn;
    pop.focus({ preventScroll: true });
  }
  let popOpener = null;
  function closePop(restoreFocus) {
    if (pop.hidden) return;
    pop.hidden = true;
    if (restoreFocus && popOpener?.isConnected) popOpener.focus({ preventScroll: true });
    popOpener = null;
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
    if (!e.target.closest('.pop')) closePop(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePop(true);
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowLeft') go(-7);
    if (e.key === 'ArrowRight') go(7);
  });
  addEventListener('scroll', () => closePop(false), { passive: true });

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

  // Logo audit (?audit, or ?audit=all for every company): each logo of the week with its company name,
  // where it came from and what the app did to it, so a wrong logo is spotted in one scan.
  const SRC_LABEL = { fmp: 'FMP', parqet: 'Parqet', override: 'Pinned URL', none: 'Monogram' };
  function renderAudit() {
    document.body.classList.add('audit');
    const all = params.get('audit') === 'all';
    const seen = new Map();
    for (let i = 0; i < 5; i++) {
      const rows = DATA.days[iso(addDays(state.monday, i))] ?? [];
      for (const key of ['bmo', 'amc', 'tns']) {
        const list = rows.filter((r) => r.t === key);
        for (const r of all ? list : list.slice(0, CONFIG.perSession)) seen.set(r.s, r);
      }
      for (const r of rows) if (WATCH.has(r.s)) seen.set(r.s, r);
    }
    const rows = [...seen.values()].sort((a, b) => a.s.localeCompare(b.s));
    $('weekRange').textContent = `Logo audit · week of ${fmtRange(state.monday)} · ${rows.length} companies`;
    $('stats').innerHTML = '';
    $('board').innerHTML = `<div class="audit-grid">${rows.map((r) => `<div class="audit-card">
      <div class="audit-card__pair">${tile(r)}${LOGOS[r.s]?.src && LOGOS[r.s].src !== 'none' ? `<img class="audit-card__orig" alt="" src="${esc(ORIGINAL[LOGOS[r.s].src](r.s))}">` : ''}</div>
      <div class="audit-card__name">${esc(r.n)}</div>
      <div class="audit-card__flags" data-for="${esc(r.s)}"></div></div>`).join('')}</div>`;
  }
  function updateAuditFlags() {
    for (const el of document.querySelectorAll('.audit-card__flags')) {
      const t = el.parentElement.querySelector('.tile').dataset;
      const flags = [SRC_LABEL[t.src] ?? t.src];
      if (OVERRIDES[t.s]) flags.push('pinned');
      el.innerHTML = flags.map((f, i) => `<span class="chip${i === 0 && t.src !== 'fmp' ? ' chip--alt' : ''}">${f}</span>`).join('');
    }
  }

  if (SHOT) document.body.classList.add('shot');
  if (AUDIT) {
    renderAudit();
    updateAuditFlags();
  } else {
    render();
  }
})();
