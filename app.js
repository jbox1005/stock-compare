'use strict';

/* ===== 상수 ===== */
const REPO = 'jbox1005/stock-compare'; // GitHub Pages 저장소 (설정에서 종목 추가 시 사용)
const DEFAULTS = { a: '005387', b: '005380', invert: false, period: 'day' };
const PERIOD_LABEL = { day: '일', week: '주', month: '월', year: '년' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* ===== 상태 ===== */
let state = loadState();
let indexData = null;        // data/index.json
let stocks = {};             // code -> {code, name, day, week, month}
let aligned = null;          // 현재 페어의 기간별 정렬 데이터

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('gapp.state') || '{}');
    return { ...DEFAULTS, ...s };
  } catch { return { ...DEFAULTS }; }
}
function saveState() {
  localStorage.setItem('gapp.state', JSON.stringify(state));
}

/* ===== 유틸 ===== */
const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function fmtWon(v) { return Math.round(v).toLocaleString('ko-KR'); }
function fmtPct(v, digits = 2) {
  return (v > 0 ? '+' : '') + v.toFixed(digits) + '%';
}
function fmtAxisWon(v) {
  if (Math.abs(v) >= 10000 && v % 10000 === 0) return (v / 10000).toLocaleString('ko-KR') + '만';
  if (Math.abs(v) >= 10000) return (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만';
  return v.toLocaleString('ko-KR');
}
function fmtDateFull(dstr, period) {
  const [y, m, d] = dstr.split('-').map(Number);
  if (period === 'year') return `${y}년`;
  if (period === 'month') return `${y}.${String(m).padStart(2, '0')}`;
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${dow})`;
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = mag;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (mag * m >= rawStep) { step = mag * m; break; }
  }
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  }
  return { ticks, step };
}

/* ===== 데이터 로드/가공 ===== */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadAll() {
  indexData = await fetchJSON('data/index.json');
  const missing = [];
  for (const code of [state.a, state.b]) {
    if (stocks[code]) continue;
    try { stocks[code] = await fetchJSON(`data/${code}.json`); }
    catch { missing.push(code); }
  }
  return missing;
}

// 두 종목의 [날짜, 종가] 배열을 공통 날짜 기준으로 정렬·교차
function alignSeries(sa, sb) {
  const mb = new Map(sb);
  const dates = [], av = [], bv = [];
  for (const [d, v] of sa) {
    const w = mb.get(d);
    if (w !== undefined) { dates.push(d); av.push(v); bv.push(w); }
  }
  return { dates, av, bv };
}

function cutoffISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildAligned() {
  const A = stocks[state.a], B = stocks[state.b];
  const out = {};
  for (const [period, key, days] of [
    ['day', 'day', 184],      // 최근 6개월
    ['week', 'week', 367],    // 최근 1년
    ['month', 'month', 1097], // 최근 3년
  ]) {
    const cut = cutoffISO(days);
    const s = alignSeries(A[key], B[key]);
    const from = s.dates.findIndex((d) => d >= cut);
    const i = from < 0 ? 0 : from;
    out[period] = { dates: s.dates.slice(i), av: s.av.slice(i), bv: s.bv.slice(i) };
  }
  // 년: 월봉에서 연도별 마지막 종가 → 최근 10개년
  const m = alignSeries(A.month, B.month);
  const byYear = new Map();
  m.dates.forEach((d, i) => byYear.set(d.slice(0, 4), i));
  const idxs = [...byYear.values()].slice(-10);
  out.year = {
    dates: idxs.map((i) => m.dates[i]),
    av: idxs.map((i) => m.av[i]),
    bv: idxs.map((i) => m.bv[i]),
  };
  aligned = out;
}

function currentSlice() {
  const s = aligned[state.period];
  const num = state.invert ? s.bv : s.av;
  const den = state.invert ? s.av : s.bv;
  const ratio = num.map((v, i) => (v / den[i]) * 100 - 100);
  return { ...s, ratio };
}

/* ===== X축 눈금 ===== */
function pickXTicks(dates, period) {
  const ticks = [];
  if (period === 'year') {
    dates.forEach((d, i) => ticks.push({ i, label: "'" + d.slice(2, 4) }));
    return ticks;
  }
  let prev = '';
  dates.forEach((d, i) => {
    const ym = d.slice(0, 7);
    if (ym === prev) return;
    prev = ym;
    const m = +d.slice(5, 7), yy = d.slice(2, 4);
    if (period === 'day') {
      if (i > 0 || dates.length < 40) ticks.push({ i, label: m === 1 ? `${yy}.1` : `${m}월` });
    } else if (period === 'week') {
      if (m % 2 === 1) ticks.push({ i, label: `${yy}.${m}` });
    } else { // month(3년): 1월과 7월
      if (m === 1) ticks.push({ i, label: d.slice(0, 4) });
      else if (m === 7) ticks.push({ i, label: `${m}월` });
    }
  });
  return ticks;
}

/* ===== SVG 차트 ===== */
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/**
 * container에 라인 차트를 그린다.
 * opts: { dates, period, series: [{name, color, vals}], yFmt, zeroLine, tooltipRows(i) }
 */
function drawChart(container, opts) {
  container.textContent = '';
  const W = container.clientWidth || 320;
  const H = container.clientHeight || 240;
  const pad = { l: 8, r: 14, t: 10, b: 22 };
  const surface = cssVar('--surface');

  const all = opts.series.flatMap((s) => s.vals);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (opts.zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const padV = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1;
  const { ticks } = niceTicks(lo - padV, hi + padV, 4);
  const yLo = Math.min(lo - padV, ticks[0]);
  const yHi = Math.max(hi + padV, ticks[ticks.length - 1]);

  // Y 라벨 폭 측정 후 좌측 패딩 결정
  const labels = ticks.map(opts.yFmt);
  const maxLen = Math.max(...labels.map((s) => s.length));
  pad.l = 10 + maxLen * 6.6;

  const N = opts.dates.length;
  const x = (i) => pad.l + (N < 2 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (N - 1));
  const y = (v) => pad.t + ((yHi - v) / (yHi - yLo)) * (H - pad.t - pad.b);

  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });

  // 그리드 + Y 라벨
  ticks.forEach((t, k) => {
    const yy = y(t);
    svg.append(el('line', {
      x1: pad.l, x2: W - pad.r, y1: yy, y2: yy,
      stroke: opts.zeroLine && t === 0 ? cssVar('--baseline') : cssVar('--grid'),
      'stroke-width': 1,
    }));
    const txt = el('text', {
      x: pad.l - 6, y: yy + 3.5, 'text-anchor': 'end',
      'font-size': 10, fill: cssVar('--muted'),
    });
    txt.textContent = labels[k];
    svg.append(txt);
  });

  // X 라벨
  for (const { i, label } of pickXTicks(opts.dates, opts.period)) {
    const txt = el('text', {
      x: x(i), y: H - 7, 'text-anchor': 'middle',
      'font-size': 10, fill: cssVar('--muted'),
    });
    txt.textContent = label;
    svg.append(txt);
  }

  // 라인 + 끝점
  for (const s of opts.series) {
    const d = s.vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    svg.append(el('path', {
      d, fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    const li = s.vals.length - 1;
    svg.append(el('circle', {
      cx: x(li), cy: y(s.vals[li]), r: 4, fill: s.color, stroke: surface, 'stroke-width': 2,
    }));
  }

  // 크로스헤어 + 호버 점
  const cross = el('line', {
    y1: pad.t, y2: H - pad.b, stroke: cssVar('--baseline'), 'stroke-width': 1, visibility: 'hidden',
  });
  svg.append(cross);
  const hoverDots = opts.series.map((s) => {
    const c = el('circle', { r: 4, fill: s.color, stroke: surface, 'stroke-width': 2, visibility: 'hidden' });
    svg.append(c);
    return c;
  });

  container.append(svg);

  // 툴팁
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  container.append(tip);

  function showAt(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    let i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (N - 1));
    i = Math.max(0, Math.min(N - 1, i));
    const cx = x(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    opts.series.forEach((s, k) => {
      hoverDots[k].setAttribute('cx', cx);
      hoverDots[k].setAttribute('cy', y(s.vals[i]));
      hoverDots[k].setAttribute('visibility', 'visible');
    });
    tip.textContent = '';
    const dt = document.createElement('div');
    dt.className = 'tt-date';
    dt.textContent = fmtDateFull(opts.dates[i], opts.period);
    tip.append(dt);
    for (const row of opts.tooltipRows(i)) {
      const r = document.createElement('div');
      r.className = 'tt-row';
      const key = document.createElement('span');
      key.className = 'tt-key';
      key.style.background = row.color || 'transparent';
      const val = document.createElement('span');
      val.className = 'tt-val';
      val.textContent = row.value;
      const name = document.createElement('span');
      name.className = 'tt-name';
      name.textContent = row.name;
      r.append(key, val, name);
      tip.append(r);
    }
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = cx + 12;
    if (left + tw > W - 4) left = cx - tw - 12;
    tip.style.left = Math.max(4, left) + 'px';
  }
  function hide() {
    cross.setAttribute('visibility', 'hidden');
    hoverDots.forEach((c) => c.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  }
  svg.addEventListener('pointermove', (e) => showAt(e.clientX));
  svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
  svg.addEventListener('pointerleave', hide);
}

/* ===== 렌더링 ===== */
function names() {
  const nA = stocks[state.a]?.name || state.a;
  const nB = stocks[state.b]?.name || state.b;
  return {
    a: nA, b: nB,
    num: state.invert ? nB : nA,
    den: state.invert ? nA : nB,
  };
}

function deltaEl(diff, suffixFn) {
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '―';
  const span = document.createElement('div');
  span.className = 'delta ' + cls;
  span.textContent = `${arrow} ${suffixFn(Math.abs(diff))}`;
  return span;
}

function renderStats(slice) {
  const n = names();
  const wrap = $('stats');
  wrap.textContent = '';
  const last = slice.dates.length - 1;
  const prev = Math.max(0, last - 1);
  const defs = [
    { color: cssVar('--series-a'), label: n.a, val: fmtWon(slice.av[last]), d: slice.av[last] - slice.av[prev], sfx: (v) => fmtWon(v) },
    { color: cssVar('--series-b'), label: n.b, val: fmtWon(slice.bv[last]), d: slice.bv[last] - slice.bv[prev], sfx: (v) => fmtWon(v) },
    { color: cssVar('--series-r'), label: '괴리율', val: fmtPct(slice.ratio[last]), d: slice.ratio[last] - slice.ratio[prev], sfx: (v) => v.toFixed(2) + '%p' },
  ];
  for (const t of defs) {
    const tile = document.createElement('div');
    tile.className = 'stat';
    const lab = document.createElement('div');
    lab.className = 'label';
    const key = document.createElement('span');
    key.className = 'key';
    key.style.background = t.color;
    lab.append(key, document.createTextNode(t.label));
    const val = document.createElement('div');
    val.className = 'value';
    val.textContent = t.val;
    tile.append(lab, val, deltaEl(t.d, t.sfx));
    wrap.append(tile);
  }
}

function renderLegend() {
  const n = names();
  const wrap = $('price-legend');
  wrap.textContent = '';
  for (const [color, name] of [[cssVar('--series-a'), n.a], [cssVar('--series-b'), n.b]]) {
    const item = document.createElement('span');
    item.className = 'item';
    const key = document.createElement('span');
    key.className = 'key';
    key.style.background = color;
    item.append(key, document.createTextNode(name));
    wrap.append(item);
  }
}

function renderCharts(slice) {
  const n = names();
  const cA = cssVar('--series-a'), cB = cssVar('--series-b'), cR = cssVar('--series-r');

  drawChart($('price-chart'), {
    dates: slice.dates,
    period: state.period,
    series: [
      { name: n.a, color: cA, vals: slice.av },
      { name: n.b, color: cB, vals: slice.bv },
    ],
    yFmt: fmtAxisWon,
    zeroLine: false,
    tooltipRows: (i) => [
      { color: cA, value: fmtWon(slice.av[i]), name: n.a },
      { color: cB, value: fmtWon(slice.bv[i]), name: n.b },
      { color: cR, value: fmtPct(slice.ratio[i]), name: '괴리율' },
    ],
  });

  $('ratio-title').textContent = `괴리율 = ${n.num} ÷ ${n.den} − 100%`;
  drawChart($('ratio-chart'), {
    dates: slice.dates,
    period: state.period,
    series: [{ name: '괴리율', color: cR, vals: slice.ratio }],
    yFmt: (v) => fmtPct(v, Math.abs(v) < 10 && v !== Math.round(v) ? 1 : 0),
    zeroLine: true,
    tooltipRows: (i) => [{ color: cR, value: fmtPct(slice.ratio[i]), name: '괴리율' }],
  });
}

function renderTable(slice) {
  const n = names();
  const table = $('data-table');
  table.textContent = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of ['날짜', n.a, n.b, '괴리율']) {
    const th = document.createElement('th');
    th.textContent = h;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (let i = slice.dates.length - 1; i >= 0; i--) {
    const tr = document.createElement('tr');
    for (const v of [fmtDateFull(slice.dates[i], state.period), fmtWon(slice.av[i]), fmtWon(slice.bv[i]), fmtPct(slice.ratio[i])]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
}

function renderAll() {
  const slice = currentSlice();
  document.querySelectorAll('.tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.period === state.period));
  });
  renderStats(slice);
  renderLegend();
  renderCharts(slice);
  renderTable(slice);
}

/* ===== 설정 ===== */
function fillSelect(sel, chosen) {
  sel.textContent = '';
  for (const s of indexData?.symbols || []) {
    const o = document.createElement('option');
    o.value = s.code;
    o.textContent = `${s.name} (${s.code})`;
    sel.append(o);
  }
  const custom = document.createElement('option');
  custom.value = '__custom';
  custom.textContent = '직접 입력…';
  sel.append(custom);
  const known = (indexData?.symbols || []).some((s) => s.code === chosen);
  sel.value = known ? chosen : '__custom';
  return known;
}

function syncCustomVisibility() {
  for (const [sel, inp] of [[$('sel-a'), $('inp-a')], [$('sel-b'), $('inp-b')]]) {
    inp.hidden = sel.value !== '__custom';
  }
  const anyCustom = $('sel-a').value === '__custom' || $('sel-b').value === '__custom';
  $('new-symbol-note').hidden = !anyCustom;
}

function openSettings() {
  const knownA = fillSelect($('sel-a'), state.a);
  const knownB = fillSelect($('sel-b'), state.b);
  if (!knownA) $('inp-a').value = state.a;
  if (!knownB) $('inp-b').value = state.b;
  $('inp-token').value = localStorage.getItem('gapp.token') || '';
  $('edit-link').href = `https://github.com/${REPO}/edit/main/symbols.json`;
  $('settings-status').textContent = '';
  syncCustomVisibility();
  $('settings-dialog').showModal();
}

async function addSymbolsToRepo(codes, token) {
  const api = `https://api.github.com/repos/${REPO}/contents/symbols.json`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const cur = await (await fetch(api, { headers })).json();
  if (!cur.content) throw new Error('symbols.json을 읽지 못했습니다 (토큰 권한 확인)');
  const parsed = JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\s/g, '')))));
  const merged = [...new Set([...parsed.symbols, ...codes])];
  if (merged.length === parsed.symbols.length) return false; // 이미 존재
  const body = JSON.stringify({
    message: `chore: add symbols ${codes.join(', ')}`,
    sha: cur.sha,
    content: btoa(unescape(encodeURIComponent(JSON.stringify({ symbols: merged }, null, 2) + '\n'))),
  });
  const res = await fetch(api, { method: 'PUT', headers, body });
  if (!res.ok) throw new Error(`GitHub API ${res.status} — 토큰 권한을 확인하세요`);
  return true;
}

async function onSaveSettings(e) {
  e.preventDefault();
  const status = $('settings-status');
  const resolve = (sel, inp) => (sel.value === '__custom' ? inp.value.trim() : sel.value);
  const a = resolve($('sel-a'), $('inp-a'));
  const b = resolve($('sel-b'), $('inp-b'));
  if (!/^\d{6}$/.test(a) || !/^\d{6}$/.test(b)) {
    status.textContent = '종목코드는 6자리 숫자여야 합니다.';
    return;
  }
  if (a === b) {
    status.textContent = '서로 다른 두 종목을 선택하세요.';
    return;
  }
  const token = $('inp-token').value.trim();
  if (token) localStorage.setItem('gapp.token', token);

  const available = new Set((indexData?.symbols || []).map((s) => s.code));
  const missing = [a, b].filter((c) => !available.has(c));
  if (missing.length && token) {
    status.textContent = '저장소에 종목 추가 중…';
    try {
      await addSymbolsToRepo(missing, token);
      status.textContent = '추가 완료. 1~2분 후 데이터가 수집되면 자동 표시됩니다.';
    } catch (err) {
      status.textContent = String(err.message || err);
      return;
    }
  } else if (missing.length) {
    status.textContent = `${missing.join(', ')} 데이터가 아직 없습니다. symbols.json에 추가해 주세요.`;
  }

  state.a = a; state.b = b;
  saveState();
  $('settings-dialog').close();
  boot();
}

/* ===== 부트스트랩 ===== */
async function boot() {
  const msg = $('message');
  msg.hidden = false;
  msg.classList.remove('error');
  msg.textContent = '데이터를 불러오는 중…';
  $('app').hidden = true;
  try {
    const missing = await loadAll();
    if (missing.length) {
      msg.classList.add('error');
      msg.textContent = `종목 ${missing.join(', ')}의 데이터가 아직 없습니다. ` +
        `symbols.json에 추가된 직후라면 1~2분 뒤 새로고침해 주세요. (설정 ⚙︎에서 변경 가능)`;
      return;
    }
    buildAligned();
    $('updated').textContent = (indexData.updated || '').slice(0, 10) + ' 기준';
    msg.hidden = true;
    $('app').hidden = false;
    renderAll();
  } catch (err) {
    msg.classList.add('error');
    msg.textContent = '데이터 로드 실패: ' + (err.message || err);
  }
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    state.period = t.dataset.period;
    saveState();
    renderAll();
  });
});
$('btn-swap').addEventListener('click', () => {
  state.invert = !state.invert;
  saveState();
  renderAll();
});
$('btn-settings').addEventListener('click', openSettings);
$('btn-cancel').addEventListener('click', () => $('settings-dialog').close());
$('settings-form').addEventListener('submit', onSaveSettings);
$('sel-a').addEventListener('change', syncCustomVisibility);
$('sel-b').addEventListener('change', syncCustomVisibility);

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { if (!$('app').hidden) renderAll(); });
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!$('app').hidden) renderAll();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

boot();
