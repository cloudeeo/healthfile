// HealthFile page: hash routes, no framework. Routes:
//   #/                 people and the family's documents
//   #/add              upload (camera or file)
//   #/review           documents waiting for review
//   #/doc/<id>         one document: review and edit, or read
//   #/person/<id>      one person's timeline and values
//   #/person/<id>/series/<analyte>  one value over time

import { t, setLang, getLang, detectLang, storedLang, onLangChange, fmtDate, fmtNumber, UI_LANGS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const state = { status: null, people: [], docs: [], timer: null };
const KIND_COLORS = { lab_report: '#2a78d6', letter: '#1baf7a', prescription: '#eb6834', vaccination: '#8c6ad6', imaging_report: '#1aa3b3', discharge: '#d9480f', invoice: '#8c98a3', insurance: '#c29b1a', other: '#8c98a3' };

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style' && typeof v === 'object') for (const [prop, val] of Object.entries(v)) n.style.setProperty(prop, val);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const svg = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};

async function api(path, opts = {}) {
  const res = await fetch(`api/${path}`, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts, body: opts.body && typeof opts.body !== 'string' && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer) ? JSON.stringify(opts.body) : opts.body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

let toastTimer = null;
function toast(text) {
  document.querySelector('.toast')?.remove();
  const n = el('div', { class: 'toast', role: 'status', text });
  document.body.append(n);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.remove(), 2600);
}

// Theme and language ----------------------------------------------------------

const THEMES = ['auto', 'light', 'dark'];
function applyTheme(th) {
  if (th === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th;
  $('theme').textContent = t('theme.label', { theme: t(`theme.${th}`) });
}
let theme = 'auto';
try {
  theme = THEMES.includes(localStorage.getItem('healthfile-theme')) ? localStorage.getItem('healthfile-theme') : 'auto';
} catch {
  /* no storage */
}
$('theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  try {
    localStorage.setItem('healthfile-theme', theme);
  } catch {
    /* no storage */
  }
  applyTheme(theme);
});
$('lang').addEventListener('change', (e) => setLang(e.target.value, { remember: true }));
onLangChange(() => {
  $('lang').value = getLang();
  applyTheme(theme);
  render();
});

// Data ------------------------------------------------------------------------

async function refresh() {
  try {
    const [s, p, d] = await Promise.all([api('status'), api('people'), api('documents')]);
    state.status = s;
    state.people = p.people;
    state.docs = d.documents;
  } catch (e) {
    state.status = { error: e.message };
  }
  paintChrome();
}

function paintChrome() {
  const s = state.status;
  const notice = $('notice');
  notice.hidden = true;
  notice.className = 'notice';
  if (s?.error) {
    notice.hidden = false;
    notice.classList.add('bad');
    notice.textContent = s.error;
  } else if (s?.mock) {
    notice.hidden = false;
    notice.textContent = t('status.mock');
  } else if (s && s.qvac !== 'up') {
    notice.hidden = false;
    notice.classList.add('bad');
    notice.textContent = t('status.qvacDown', { why: s.qvac });
  } else if (s?.models?.reader && s.models.reader.state !== 'ready') {
    notice.hidden = false;
    notice.textContent = t('status.readerDown', { model: s.models.reader.id });
  }
  $('privacy').textContent = s && !s.error ? t('status.private') : '';
  // the demo copy says so on every page, so a screenshot or a shared screen never leaves a doubt
  const demo = !!s?.demo;
  document.body.classList.toggle('demo', demo);
  document.title = demo ? 'HealthFile · Demo' : 'HealthFile';
  let banner = $('demo-banner');
  if (demo && !banner) {
    banner = el('p', { class: 'demo-banner', id: 'demo-banner' });
    $('notice').before(banner);
  }
  if (banner) {
    banner.hidden = !demo;
    banner.textContent = demo ? t('demo.banner') : '';
  }
  const toReview = state.docs.filter((d) => d.state === 'review' || d.state === 'failed').length;
  const b = $('review-badge');
  b.hidden = !toReview;
  b.textContent = String(toReview);
}

const personOf = (id) => state.people.find((p) => p.id === id) || null;
const PERSON_COLORS = ['#2f6fed', '#d9480f', '#2b8a3e', '#862e9c', '#c92a2a', '#0b7285'];
/** A person's avatar colour; people added without one get theirs from the palette, by position. */
const colorOf = (p) => p.color || PERSON_COLORS[Math.max(0, state.people.findIndex((x) => x.id === p.id)) % PERSON_COLORS.length];
const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const kindName = (k) => t(`kind.${k || 'other'}`);

// Routing ---------------------------------------------------------------------

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  let m;
  if (h === '/') return { name: 'home' };
  if (h === '/add') return { name: 'add' };
  if (h === '/review') return { name: 'review' };
  if ((m = /^\/doc\/([0-9a-f-]{36})$/.exec(h))) return { name: 'doc', id: m[1] };
  if ((m = /^\/person\/([0-9a-f-]{36})\/series\/([a-z0-9_]+)$/.exec(h))) return { name: 'series', id: m[1], analyte: m[2] };
  if ((m = /^\/person\/([0-9a-f-]{36})$/.exec(h))) return { name: 'person', id: m[1] };
  return { name: 'home' };
}

const PAGES = { home: renderHome, add: renderAdd, review: renderReview, doc: renderDoc, person: renderPerson, series: renderSeries };
let renderSeq = 0;
async function render() {
  const r = route();
  for (const a of document.querySelectorAll('.tabs a')) a.toggleAttribute('aria-current', a.dataset.route === (r.name === 'doc' || r.name === 'person' || r.name === 'series' ? 'home' : r.name)) && a.setAttribute('aria-current', 'page');
  for (const a of document.querySelectorAll('.tabs a')) if (!a.hasAttribute('aria-current')) a.removeAttribute('aria-current');
  const seq = ++renderSeq;
  const nodes = await PAGES[r.name](r);
  if (seq !== renderSeq) return;
  view.replaceChildren(...[nodes].flat());
  window.scrollTo({ top: 0 });
}

// Home ------------------------------------------------------------------------

function docItem(d) {
  const p = personOf(d.personId);
  return el('li', {}, el('a', { class: 'item', href: `#/doc/${d.id}` },
    el('span', { class: 'dot', style: { background: KIND_COLORS[d.kind] || KIND_COLORS.other } }),
    el('span', { class: 't' }, d.title || kindName(d.kind), ' ', el('span', { class: 'kind-tag', text: kindName(d.kind) })),
    el('span', { class: 'r' }, d.date ? fmtDate(d.date) : t('timeline.undated')),
    el('span', { class: 'd' }, [p?.name, d.issuer].filter(Boolean).join(' · ') || t('people.unassigned'), d.state !== 'filed' ? [' ', el('span', { class: `state ${d.state}`, text: t(`timeline.state.${d.state}`) })] : null)));
}

function renderHome() {
  const counts = Object.fromEntries(state.people.map((p) => [p.id, state.docs.filter((d) => d.personId === p.id).length]));
  const people = el('section', { class: 'card' },
    el('h2', {}, t('people.title')),
    el('div', { class: 'people' },
      state.people.map((p) => el('a', { class: 'person', href: `#/person/${p.id}` },
        el('span', { class: 'av', style: { background: colorOf(p) }, text: initials(p.name) }),
        el('span', { class: 'n', text: p.name }),
        el('span', { class: 'm' }, p.born ? fmtDate(p.born, { year: 'numeric' }) + ' · ' : '', t('people.docs', { n: counts[p.id] || 0 })))),
      el('button', { type: 'button', class: 'person add', onclick: () => addPersonDialog() }, '+ ', t('people.add'))),
    !state.people.length ? el('p', { class: 'empty', text: t('people.empty') }) : null);
  const docs = el('section', { class: 'card' },
    el('h2', {}, t('timeline.title'), el('span', { class: 'sub', text: t('people.docs', { n: state.docs.length }) })),
    state.docs.length ? el('ul', { class: 'list' }, state.docs.slice(0, 60).map(docItem)) : el('p', { class: 'empty', text: t('timeline.empty') }));
  return [hero(), people, docs];
}

// The welcome block: title, what it does in one sentence, the numbers, three steps
function hero() {
  const c = state.status?.counts ?? {};
  const filed = c.documents?.filed ?? 0;
  const toReview = state.docs.filter((d) => d.state === 'review' || d.state === 'failed').length;
  const stat = (n, key) => el('div', { class: 'stat' }, el('span', { class: 'num', text: fmtNumber(n) }), el('span', { class: 'lbl', text: t(key) }));
  const step = (icon, title, text) => el('li', { class: 'step' }, el('span', { class: 'ic' }, icon), el('span', { class: 'st', text: t(title) }), el('span', { class: 'sd', text: t(text) }));
  return el('section', { class: 'hero' },
    el('div', { class: 'hero-text' },
      el('h1', { text: t('hero.title') }),
      el('p', { class: 'lead', text: t('hero.lead') }),
      el('div', { class: 'hero-actions' },
        el('a', { class: 'btn', href: '#/add' }, iconCamera(), t('hero.cta')),
        toReview ? el('a', { class: 'btn ghost', href: '#/review', text: t('hero.review', { n: toReview }) }) : null),
      el('div', { class: 'stats' }, stat(filed, 'hero.stat.docs'), stat(c.people ?? state.people.length, 'hero.stat.people'), stat(c.measurements ?? 0, 'hero.stat.values'))),
    el('div', { class: 'hero-art', 'aria-hidden': 'true' }, illustration()),
    el('ol', { class: 'steps' },
      step(iconCamera(), 'hero.step1', 'hero.step1d'),
      step(iconCheck(), 'hero.step2', 'hero.step2d'),
      step(iconChart(), 'hero.step3', 'hero.step3d')));
}

const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const iconCamera = () => svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, svg('path', { ...stroke, d: 'M4 8h3l1.6-2.4h6.8L17 8h3v11H4z' }), svg('circle', { ...stroke, cx: 12, cy: 13.2, r: 3.4 }));
const iconCheck = () => svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, svg('path', { ...stroke, d: 'M6 3h9l4 4v14H6z' }), svg('path', { ...stroke, d: 'M9 13.5l2.2 2.2L15.5 11' }));
const iconChart = () => svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, svg('path', { ...stroke, d: 'M4 4v16h16' }), svg('path', { ...stroke, d: 'M7.5 15l3.5-4 3 2.5 4.5-6' }));

/** A small house holding a stack of documents, a value chart and a check: drawn here, no image files. */
function illustration() {
  const S = (tag, a, ...c) => svg(tag, a, ...c);
  return S('svg', { viewBox: '0 0 320 240', class: 'art' },
    // ground and house
    S('ellipse', { cx: 160, cy: 214, rx: 130, ry: 12, class: 'a-shadow' }),
    S('path', { d: 'M52 112 L160 34 L268 112', class: 'a-roof' }),
    S('rect', { x: 72, y: 104, width: 176, height: 108, rx: 10, class: 'a-house' }),
    // back document with a chart
    S('g', { transform: 'rotate(-8 128 150)' },
      S('rect', { x: 92, y: 96, width: 86, height: 108, rx: 7, class: 'a-paper' }),
      S('rect', { x: 104, y: 110, width: 46, height: 6, rx: 3, class: 'a-ink' }),
      S('rect', { x: 104, y: 166, width: 62, height: 14, rx: 3, class: 'a-band' }),
      S('path', { d: 'M104 186 L120 162 L136 172 L152 140 L166 150', class: 'a-line' }),
      S('circle', { cx: 152, cy: 140, r: 4, class: 'a-dot' })),
    // front document with rows and a check
    S('g', { transform: 'rotate(5 196 156)' },
      S('rect', { x: 150, y: 100, width: 92, height: 114, rx: 7, class: 'a-paper' }),
      S('rect', { x: 162, y: 114, width: 52, height: 7, rx: 3.5, class: 'a-ink strong' }),
      ...[132, 146, 160, 174].map((y, i) => S('g', {}, S('rect', { x: 162, y, width: 40, height: 5, rx: 2.5, class: 'a-ink' }), S('rect', { x: 210, y, width: i === 1 ? 20 : 16, height: 5, rx: 2.5, class: i === 1 ? 'a-flag' : 'a-ink' }))),
      S('circle', { cx: 222, cy: 196, r: 13, class: 'a-check-bg' }),
      S('path', { d: 'M215 196 l5 5 l9 -10', class: 'a-check' })),
    // a small heart above the door line
    S('path', { d: 'M160 74 c-6 -8 -18 -3 -14 6 c2 5 8 9 14 13 c6 -4 12 -8 14 -13 c4 -9 -8 -14 -14 -6 z', class: 'a-heart' }));
}

function addPersonDialog() {
  const name = el('input', { type: 'text', autocomplete: 'off', required: true });
  const born = el('input', { type: 'date' });
  const card = el('section', { class: 'card' },
    el('h2', {}, t('people.add')),
    el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      try {
        await api('people', { method: 'POST', body: { name: name.value.trim(), born: born.value || null, color: PERSON_COLORS[state.people.length % PERSON_COLORS.length] } });
        await refresh();
        render();
      } catch (err) {
        toast(err.message);
      }
    } },
      el('div', { class: 'grid-2' }, el('label', { class: 'field' }, el('span', { text: t('people.name') }), name), el('label', { class: 'field' }, el('span', { text: t('people.born') }), born)),
      el('div', { class: 'row-actions' }, el('button', { type: 'submit', class: 'chip primary', text: t('common.save') }), el('button', { type: 'button', class: 'chip', text: t('common.cancel'), onclick: () => render() }))));
  view.prepend(card);
  name.focus();
}

// Add -------------------------------------------------------------------------

const uploads = [];
function renderAdd() {
  const person = el('select', {}, el('option', { value: '', text: t('add.personAuto') }), state.people.map((p) => el('option', { value: p.id, text: p.name })));
  const drop = el('div', { class: 'drop' });
  const cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, onchange: (e) => sendFiles(e.target.files, person.value) });
  const file = el('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, onchange: (e) => sendFiles(e.target.files, person.value) });
  drop.append(
    el('p', { text: t('add.hint') }),
    el('div', { class: 'big' }, el('label', {}, '📷 ', t('add.camera'), cam), el('label', { class: 'alt' }, '📄 ', t('add.file'), file)));
  drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    sendFiles(e.dataTransfer.files, person.value);
  });
  const list = el('ul', { class: 'uploads', id: 'uploads' });
  paintUploads(list);
  const demoNote = state.status?.demo ? el('p', { class: 'demo-note', text: t('demo.addNote') }) : null;
  return el('section', { class: 'card' }, el('h2', {}, t('add.title')), demoNote, el('label', { class: 'field mb' }, el('span', { text: t('add.person') }), person), drop, list);
}

function paintUploads(list = $('uploads')) {
  if (!list) return;
  list.replaceChildren(...uploads.slice(-8).reverse().map((u) => el('li', { class: u.error ? 'bad' : '' },
    u.phase === 'uploading' || u.phase === 'reading' ? el('span', { class: 'spin' }) : null,
    u.error ? t('add.failed', { name: u.name, why: u.error }) : u.phase === 'uploading' ? t('add.uploading') : u.phase === 'reading' ? t('add.queued', { name: u.name }) : el('a', { href: `#/doc/${u.id}` }, t('add.done', { name: u.name })))));
}

async function sendFiles(files, personId) {
  for (const f of files) {
    const u = { name: f.name, phase: 'uploading' };
    uploads.push(u);
    paintUploads();
    try {
      const res = await fetch('api/documents', { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name), ...(personId ? { 'X-Person-Id': personId } : {}) }, body: f });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      u.id = j.id;
      u.phase = 'reading';
      paintUploads();
      watch(j.id, (d) => {
        if (d.state === 'review' || d.state === 'filed') u.phase = 'done';
        if (d.state === 'failed') u.error = d.error;
        paintUploads();
        refresh();
      });
    } catch (e) {
      u.error = e.message;
      paintUploads();
    }
  }
}

/** Poll a document until it leaves `reading`. */
function watch(id, cb) {
  const tick = async () => {
    try {
      const d = await api(`documents/${id}`);
      if (d.state !== 'reading') return cb(d);
    } catch {
      /* try again */
    }
    setTimeout(tick, state.status?.mock ? 700 : 2000);
  };
  setTimeout(tick, 600);
}

// Review list -----------------------------------------------------------------

function renderReview() {
  const pending = state.docs.filter((d) => d.state !== 'filed');
  return el('section', { class: 'card' },
    el('h2', {}, t('review.title'), el('span', { class: 'sub', text: t('people.docs', { n: pending.length }) })),
    pending.length ? el('ul', { class: 'list' }, pending.map(docItem)) : el('p', { class: 'empty', text: t('review.empty') }));
}

// Document --------------------------------------------------------------------

async function renderDoc({ id }) {
  let d;
  try {
    d = await api(`documents/${id}`);
  } catch (e) {
    return el('p', { class: 'empty', text: e.message });
  }
  if (d.state === 'reading') {
    watch(id, () => render());
    return el('section', { class: 'card' }, el('h2', {}, d.originalName), el('p', {}, el('span', { class: 'spin inline' }), d.pages ? t('review.readingPages', { n: d.pages }) : t('review.reading')));
  }
  if (d.state === 'failed') {
    return el('section', { class: 'card' }, el('h2', {}, d.originalName), el('p', { class: 'empty', text: t('review.failed', { why: d.error }) }),
      el('div', { class: 'row-actions' },
        el('button', { type: 'button', class: 'chip primary', text: t('review.retry'), onclick: async () => (await api(`documents/${id}/reread`, { method: 'POST' }), render()) }),
        el('a', { class: 'chip', href: `api/documents/${id}/original`, target: '_blank', rel: 'noopener', text: t('doc.original') }),
        deleteButton(d)));
  }
  return docEditor(d);
}

function deleteButton(d) {
  return el('button', { type: 'button', class: 'chip danger', text: t('common.delete'), onclick: async () => {
    if (!confirm(t('common.confirmDelete'))) return;
    if (!confirm(t('common.confirmDeleteAgain', { title: d.title || d.originalName }))) return;
    await api(`documents/${d.id}`, { method: 'DELETE' });
    await refresh();
    location.hash = '#/';
  } });
}

function docEditor(d) {
  const reviewing = d.state === 'review';
  const edited = new Set(d.editedFields || []);
  const form = { personId: d.personId, date: d.date, kind: d.kind || 'other', title: d.title || '', issuer: d.issuer || '', measurements: d.measurements.map((m) => ({ ...m })) };

  const pages = el('div', { class: 'pages' }, d.pageList.map((p) => [el('img', { src: `api/documents/${d.id}/page-${p.n}.jpg`, alt: t('common.page', { n: p.n }), loading: 'lazy' }), d.pageList.length > 1 ? el('div', { class: 'pn', text: t('common.page', { n: p.n }) }) : null]));

  const field = (key, input) => {
    input.addEventListener('input', () => (form[key] = input.value || null, input.classList.add('edited')));
    return el('label', { class: 'field' }, el('span', { text: t(key === 'title' ? 'review.title.field' : `review.${key}`) }), input);
  };
  const personSel = el('select', {}, el('option', { value: '', text: t('people.unassigned') }), state.people.map((p) => el('option', { value: p.id, text: p.name, selected: p.id === d.personId })));
  const kindSel = el('select', {}, (state.status?.kinds || []).map((k) => el('option', { value: k, text: kindName(k), selected: k === form.kind })));
  const dateIn = el('input', { type: 'date', value: d.date || '' });
  const titleIn = el('input', { type: 'text', value: form.title, maxlength: 80 });
  const issuerIn = el('input', { type: 'text', value: form.issuer, maxlength: 160 });
  personSel.addEventListener('change', () => (form.personId = personSel.value || null));
  kindSel.addEventListener('change', () => (form.kind = kindSel.value));
  const meta = el('div', { class: 'meta' }, field('person', personSel), field('kind', kindSel), field('date', dateIn), field('title', titleIn), field('issuer', issuerIn));
  dateIn.addEventListener('input', () => (form.date = dateIn.value || null));

  // values table
  const tbody = el('tbody');
  const addRow = (m, isNew = false) => {
    const row = {
      name: el('input', { class: 'name', value: m.name || '' }), value: el('input', { value: m.value || '' }), unit: el('input', { value: m.unit || '' }), reference: el('input', { value: m.reference || '' }), flag: el('input', { class: 'flag-in', value: m.flag || '', maxlength: 2 }),
    };
    for (const [k, inp] of Object.entries(row)) inp.addEventListener('input', () => ((m[k] = inp.value || null), (m.edited = true), inp.classList.add('edited')));
    const tr = el('tr', {},
      el('td', {}, row.name, m.analyte ? el('span', { class: 'canon-tag', text: m.analyte.replace(/_/g, ' ') }) : null),
      el('td', {}, row.value), el('td', {}, row.unit), el('td', {}, row.reference), el('td', { class: 'flag' }, row.flag),
      reviewing ? el('td', {}, el('button', { type: 'button', class: 'x', 'aria-label': t('review.removeValue'), text: '×', onclick: () => (form.measurements.splice(form.measurements.indexOf(m), 1), tr.remove()) })) : null);
    if (!reviewing) for (const inp of Object.values(row)) inp.readOnly = true;
    tbody.append(tr);
    if (isNew) row.name.focus();
  };
  form.measurements.forEach((m) => addRow(m));
  const values = el('details', { open: form.measurements.length > 0 || d.kind === 'lab_report' },
    el('summary', {}, t('review.values'), ' ', el('span', { class: 'sub', text: `(${t('common.values', { n: form.measurements.length })})` })),
    reviewing ? el('p', { class: 'hint', text: t('review.valuesHint') }) : null,
    el('div', { class: 'table-wrap' }, el('table', { class: 'vals' }, el('thead', {}, el('tr', {}, ['name', 'value', 'unit', 'ref', 'flag'].map((c) => el('th', { text: t(`review.col.${c}`) })), reviewing ? el('th') : null)), tbody)),
    reviewing ? el('div', { class: 'row-actions' }, el('button', { type: 'button', class: 'chip', text: `+ ${t('review.addValue')}`, onclick: () => { const m = { name: '', value: '', unit: '', reference: '', flag: '', edited: true }; form.measurements.push(m); addRow(m, true); } })) : null);

  const meds = d.items.filter((i) => i.kind === 'medication');
  const fups = d.items.filter((i) => i.kind === 'follow_up');
  const amount = d.items.find((i) => i.kind === 'amount');
  const extras = [
    meds.length ? el('div', {}, el('strong', { text: t('review.medications') }), ' ', meds.map((m) => el('span', { class: 'pill', text: [m.name, m.dose, m.schedule].filter(Boolean).join(' · ') }))) : null,
    fups.length ? el('div', {}, el('strong', { text: t('review.followUps') }), ' ', fups.map((f) => el('span', { class: 'pill', text: [f.what, f.when].filter(Boolean).join(': ') }))) : null,
    amount ? el('div', {}, el('strong', { text: t('review.amount') }), ' ', el('span', { class: 'pill', text: `${fmtNumber(amount.total, { minimumFractionDigits: 2 })} ${amount.currency || ''}` })) : null,
  ];

  const save = async (confirmToo) => {
    try {
      const body = { personId: form.personId, date: form.date, kind: form.kind, title: form.title || null, issuer: form.issuer || null, measurements: form.measurements.filter((m) => m.name && m.name.trim()) };
      await api(`documents/${d.id}${confirmToo ? '/confirm' : ''}`, { method: confirmToo ? 'POST' : 'PATCH', body });
      await refresh();
      toast(confirmToo ? t('review.confirmed') : t('common.save'));
      render();
    } catch (e) {
      toast(e.message);
    }
  };

  const head = el('h2', {}, d.title || kindName(d.kind), el('span', { class: 'sub' }, kindName(d.kind), d.date ? ` · ${fmtDate(d.date)}` : ''));
  const info = el('p', { class: 'hint' },
    d.personHint ? t('review.personHint', { name: d.personHint }) + ' · ' : '',
    t('common.pages', { n: d.pages }),
    d.readerMs ? ' · ' + t('review.readIn', { model: d.readerModel, s: (d.readerMs / 1000).toFixed(1) }) : '',
    d.reviewedAt ? ' · ' + t('doc.filedOn', { date: fmtDate(d.reviewedAt) }) : '',
    edited.size ? ' · ' + t('review.edited', { fields: [...edited].join(', ') }) : '');
  const actions = el('div', { class: 'row-actions' },
    reviewing ? el('button', { type: 'button', class: 'chip primary', text: t('review.confirm'), onclick: () => save(true) }) : el('button', { type: 'button', class: 'chip primary', text: t('common.save'), onclick: () => save(false) }),
    el('a', { class: 'chip', href: `api/documents/${d.id}/original`, target: '_blank', rel: 'noopener', text: t('doc.original') }),
    el('button', { type: 'button', class: 'chip', text: t('doc.reread'), onclick: async () => (await api(`documents/${d.id}/reread`, { method: 'POST' }), render()) }),
    deleteButton(d));

  const right = el('div', { class: 'card' }, head, reviewing ? el('p', { class: 'hint', text: t('review.intro') }) : null, info, meta, values, ...extras.filter(Boolean),
    el('details', {}, el('summary', { text: t('review.text') }), el('pre', { class: 'text-block', text: d.text || '' })), actions);
  return el('div', { class: 'doc' }, pages, right);
}

// Person ----------------------------------------------------------------------

async function renderPerson({ id }) {
  const p = personOf(id);
  if (!p) return el('p', { class: 'empty', text: t('common.unknown') });
  let analytes = [];
  try {
    analytes = (await api(`people/${id}/analytes`)).analytes;
  } catch {
    /* none */
  }
  const docs = state.docs.filter((d) => d.personId === id);
  let kind = '';
  const list = el('ul', { class: 'list' });
  const paintList = () => list.replaceChildren(...docs.filter((d) => !kind || d.kind === kind).map(docItem));
  paintList();
  const filter = el('select', { 'aria-label': t('timeline.filter'), onchange: (e) => ((kind = e.target.value), paintList()) }, el('option', { value: '', text: t('timeline.allKinds') }), [...new Set(docs.map((d) => d.kind))].map((k) => el('option', { value: k, text: kindName(k) })));
  const header = el('section', { class: 'card' },
    el('h2', {}, el('span', { class: 'av small', style: { background: colorOf(p) }, text: initials(p.name) }), p.name, el('span', { class: 'sub' }, p.born ? fmtDate(p.born) + ' · ' : '', t('people.docs', { n: docs.length }))));
  const values = el('section', { class: 'card' },
    el('h2', {}, t('values.title')),
    analytes.length ? el('div', { class: 'analytes' }, analytes.map((a) => {
      const L = a.latest;
      return el('a', { class: 'analyte', href: `#/person/${id}/series/${a.analyte}` },
        el('span', { class: 'n', text: labelOf(a.analyte) }),
        el('span', { class: `v ${L?.flag || ''}` }, L?.value ?? '', ' ', el('small', { text: L?.unit || '' })),
        el('span', { class: 'm' }, t('values.points', { n: a.points }), ' · ', t('values.latest'), ' ', fmtDate(L?.date)));
    })) : el('p', { class: 'empty', text: t('values.empty') }));
  const timeline = el('section', { class: 'card' }, el('h2', {}, t('timeline.title'), filter), docs.length ? list : el('p', { class: 'empty', text: t('timeline.empty') }));
  return [header, values, timeline];
}

const labelOf = (analyte) => analyte.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).replace(/\b(hdl|ldl|tsh|psa|crp|esr|inr|ck|ldh|ggt|alp|alt|ast|mcv|mch|mchc|rbc|wbc|bmi|hba1c|egfr|ft3|ft4|bnp|pt|aptt)\b/gi, (s) => s.toUpperCase());

async function renderSeries({ id, analyte }) {
  const p = personOf(id);
  if (!p) return el('p', { class: 'empty', text: t('common.unknown') });
  const { points } = await api(`people/${id}/series/${analyte}`);
  const title = el('h2', {}, el('a', { href: `#/person/${id}`, text: '‹ ' + p.name }), ' ', labelOf(analyte), el('span', { class: 'sub', text: t('values.points', { n: points.length }) }));
  const unit = points.find((x) => x.unit)?.unit || '';
  const table = el('table', { class: 'points' }, el('tbody', {}, points.slice().reverse().map((x) => el('tr', {},
    el('td', {}, fmtDate(x.date)),
    el('td', { class: `num ${x.flag || ''}`, text: `${x.value} ${x.unit || ''}` }),
    el('td', {}, x.reference ? t('values.range', { range: x.reference }) : ''),
    el('td', {}, el('a', { href: `#/doc/${x.documentId}`, text: '→' }))))));
  return el('section', { class: 'card' }, title, points.length > 1 ? chart(points, unit) : null, table);
}

/** A line over time with the reference band, as inline SVG. */
function chart(points, unit) {
  const W = 640;
  const H = 240;
  const L = 48;
  const R = 28;
  const T = 14;
  const B = 28;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.number);
  const lows = points.map((p) => p.refLow).filter((v) => v != null);
  const highs = points.map((p) => p.refHigh).filter((v) => v != null);
  // the range includes the reference bounds, so an open range ("< 130") still shows its band
  let yMin = Math.min(...ys, ...lows, ...highs);
  let yMax = Math.max(...ys, ...lows, ...highs);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.12;
  yMin = Math.max(0, yMin - pad);
  yMax += pad;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || x0 + 1;
  const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y) => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
  const s = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('values.chartTitle', { name: unit, n: points.length }) });
  const lo = lows.length ? Math.max(...lows) : null;
  const hi = highs.length ? Math.min(...highs) : null;
  if (lo != null || hi != null) {
    const top = Y(hi ?? yMax);
    const bottom = Y(lo ?? yMin);
    s.append(svg('rect', { class: 'band', x: L, y: top, width: W - L - R, height: Math.max(0, bottom - top) }), svg('title', {}, t('values.refBand')));
  }
  // y axis: 4 ticks
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    s.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: Y(v), y2: Y(v), 'stroke-dasharray': i ? '2 4' : null }), svg('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmtNumber(v, { maximumFractionDigits: v < 10 ? 1 : 0 })));
  }
  s.append(svg('path', { class: 'line', d: points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(' ') }));
  points.forEach((p, i) => {
    s.append(svg('circle', { class: `pt${p.flag ? ' out' : ''}`, cx: X(xs[i]), cy: Y(ys[i]), r: 4 }, svg('title', {}, `${fmtDate(p.date)}: ${p.value} ${p.unit || ''}`)));
    s.append(svg('text', { class: 'lbl', x: X(xs[i]), y: Y(ys[i]) - 8, 'text-anchor': 'middle' }, p.value));
  });
  const labels = points.length <= 6 ? points : [points[0], points[Math.floor(points.length / 2)], points.at(-1)];
  labels.forEach((p, i) => s.append(svg('text', { x: X(Date.parse(p.date)), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, fmtDate(p.date, { month: 'short', year: '2-digit' }))));
  if (unit) s.append(svg('text', { x: L, y: 10 }, unit));
  return s;
}

// Boot ------------------------------------------------------------------------

(async () => {
  await refresh();
  const lang = detectLang({ stored: storedLang(), browser: navigator.language, server: state.status?.lang });
  setLang(lang);
  $('lang').value = getLang();
  applyTheme(theme);
  paintChrome();
  window.addEventListener('hashchange', render);
  await render();
  setInterval(async () => {
    const before = JSON.stringify(state.docs.map((d) => [d.id, d.state]));
    await refresh();
    if (JSON.stringify(state.docs.map((d) => [d.id, d.state])) !== before && ['home', 'review', 'person'].includes(route().name)) render();
  }, state.status?.pollMs || 4000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
void UI_LANGS;
