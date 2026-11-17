const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { history, data, steps } = require('../assets/forecast-figure.js');
const fixture = require('./fixtures/synthetic/predictions.json');
const TODAY = '2026-11-17';

test('site template keeps the summary figure and detail band without mounting a second figure', () => {
  const app = fs.readFileSync('assets/app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(app, /class="r pd-row-figure" data-forecast-figure="list"/);
  const template = app.match(/function forecast\(p\) \{([\s\S]*?)\n  \}/)[1];
  const body = template.slice(template.indexOf('<div class="fc-body">'));
  assert.ok(body.startsWith('<div class="fc-body">'));
  assert.match(body, /\$\{bandSvg\(p\)\}/);
  assert.doesNotMatch(body, /data-forecast-figure|class="[^"]*jk-figure/);
  for (const source of [app, html]) assert.doesNotMatch(source, /pd-detail-figure|data-forecast-figure="detail"/);
});

// Same built-in-only fake DOM approach as the headline motion tests, extended
// to run the actual, hash-checked vendor and the site adapter together.
function load({ reduced = false, rm = false } = {}) {
  let now = 0, id = 0;
  const frames = new Map(), timers = new Map(), observers = [], resizes = [], reads = [];
  class Element {
    constructor(tag = 'span') {
      this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {};
      const classes = new Set();
      this.classList = { add: (name) => classes.add(name), contains: (name) => classes.has(name) };
    }
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'class') String(value).split(' ').forEach((name) => this.classList.add(name));
    }
    getAttribute(name) { return this.attrs[name] ?? null; }
    set textContent(value) { this.children = []; this.text = String(value); }
    get textContent() { return this.children.length ? this.children.map((n) => n.textContent).join('') : this.text || ''; }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    querySelectorAll(selector) {
      return this.children.flatMap((node) => [
        ...(node.classList.contains(selector.slice(1)) ? [node] : []), ...node.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest() { return this === group ? group : this.parent?.closest() || null; }
    getBoundingClientRect() { return { width: 60, height: 12 }; }
  }
  const root = new Element('html'); if (rm) root.classList.add('jk-rm');
  const group = new Element('div'); group.setAttribute('data-jk-figure-scale', 'auto-percent');
  group.dataset.scaleLabel = 'scale';
  const label = new Element();
  const media = { matches: reduced, addEventListener(name, fn) { this.change = fn; }, removeEventListener() {} };
  const window = {};
  const context = vm.createContext({ window,
    document: { documentElement: root, createElement: (tag) => new Element(tag), createElementNS: (_, tag) => new Element(tag),
      getElementById: (id) => id === 'scale' ? label : null, addEventListener() {} },
    matchMedia: () => media, performance: { now: () => now },
    getComputedStyle: () => ({ fontSize: '16px', getPropertyValue(name) {
      reads.push(name); return { '--jk-dur-2': '200ms', '--jk-ease-out': 'cubic-bezier(0.2, 0, 0, 1)', '--jk-figure-dot': '3' }[name] || '';
    } }),
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout: (id) => timers.delete(id),
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe(target, options) { this.target = target; this.options = options; } disconnect() { this.target = null; } },
    ResizeObserver: class { constructor(fn) { resizes.push(fn); } observe() {} disconnect() {} }
  });
  window.MutationObserver = context.MutationObserver; window.ResizeObserver = context.ResizeObserver;
  vm.runInContext(fs.readFileSync('vendor/jaack/components/figure.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('assets/forecast-figure.js', 'utf8'), context);
  const flush = () => observers.filter((o) => o.target?.tagName === 'svg').forEach((o) => o.fn());
  return { group, label, frames, timers, reads, observers, resizes, root, media, flush,
    add(p) { const host = group.appendChild(new Element()); const figure = window.PredictieFigure.init(host, p, TODAY); flush(); return { host, figure }; },
    advance(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(time)); }
  };
}

test('daily UTC carry-forward uses published revisions, last same-day revision, and terminal snapshot', () => {
  const p = { created: '2026-11-12', midpoint: 62, history: [
    { date: '2026-11-15', to: [40, 60] },
    { date: '2026-11-12', to: [20, 40] },
    { date: '2026-11-15T12:00:00Z', to: [50, 70] }
  ] };
  assert.deepEqual(history(p, TODAY).series, [30, 30, 30, 60, 60, 62]);
  assert.deepEqual(history(p, TODAY).dates, ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', TODAY]);
});

test('opening from-band fills earlier days; undocumented days and invalid revisions remain gaps', () => {
  const p = { created: '2026-11-12', midpoint: 60, history: [{ date: '2026-11-15', from: [10, 30], to: [50, 70] }] };
  assert.deepEqual(history(p, TODAY).series, [20, 20, 20, 60, 60, 60]);
  delete p.history[0].from;
  assert.deepEqual(history(p, TODAY).series, [null, null, null, 60, 60, 60]);
  p.history.push({ date: '2026-11-16', to: null });
  assert.deepEqual(history(p, TODAY).series, [null, null, null, 60, null, 60]);
});

test('resolved history ends at resolvedOn, ignores subsequent revisions; creation falls back to first entry', () => {
  const p = { midpoint: 50, resolvedOn: '2026-11-15', history: [
    { date: '2026-11-13', to: [20, 40] }, { date: '2026-11-16', to: [90, 100] }
  ] };
  assert.deepEqual(history(p, TODAY).series, [30, 30, 50]);
  assert.equal(history(p, TODAY).dates.at(-1), p.resolvedOn);
});

test('daily timestamps use UTC even when their source offset crosses midnight', () => {
  const p = { created: '2026-11-14T23:30:00-02:00', midpoint: 50, history: [] };
  assert.deepEqual(history(p, '2026-11-16').dates, ['2026-11-15', '2026-11-16']);
});

test('step conversion goes horizontally to the change day then vertically, preserving gaps', () => {
  assert.equal(steps('M2.5 9 L10 9 L20 4 M30 7 L40 3'), 'M2.5 9 H10 V9 H20 V4 M30 7 H40 V3');
  assert.equal(steps(steps('M1 2 L3 4')), 'M1 2 H3 V4');
});

test('English alternatives describe trend at 1 pp threshold, extrema, interval and full window', () => {
  const descriptions = fixture.predictions.slice(0, 3).map((p) => data(p, TODAY).alt);
  assert.match(descriptions[0], /^rising, history minimum 38 and maximum 61 percent, interval from 48 to 64 percent/);
  assert.match(descriptions[1], /^falling, history minimum 40 and maximum 55/);
  assert.match(descriptions[2], /^stable, history minimum 49 and maximum 51 percent, interval unavailable/);
  assert.match(descriptions[0], /full history, 30 revisions, since 19 Oct/);
});

test('vendor auto-percent shares 30–70 for X/Y/Z and 20–90 for all 11 synthetic forecasts', () => {
  const ui = load(); fixture.predictions.slice(0, 3).forEach((p) => ui.add(p));
  assert.deepEqual([...ui.group._jkFigureScale], [30, 70]);
  fixture.predictions.slice(3).forEach((p) => ui.add(p));
  assert.deepEqual([...ui.group._jkFigureScale], [20, 90]);
  assert.equal(ui.label.textContent, 'Shared scale 20–90%');
});

test('current band >=2px is drawn in every view, including a single day; no interval means no band', () => {
  const ui = load();
  for (const view of ['list', 'grid', 'detail']) {
    const p = fixture.predictions.find((p) => p.question === 'Mercato D');
    const { host, figure } = ui.add(p); host.dataset.forecastFigure = view;
    assert.ok(+host.querySelector('.jk-figure-band').getAttribute('height') >= 2);
    assert.equal(host.querySelector('.jk-figure-spark').getAttribute('aria-hidden'), 'true');
    assert.doesNotMatch(host.querySelector('.jk-figure-line').getAttribute('d'), /L/);
    figure.update({ ...p, created: TODAY, history: [] }, TODAY);
    assert.equal(host.querySelector('.jk-figure-line'), null);
    assert.ok(host.querySelector('.jk-figure-band'));
    assert.doesNotMatch(host.textContent, /insufficient/i);
    figure.update(fixture.predictions[2], TODAY);
    assert.equal(host.querySelector('.jk-figure-band'), null);
    assert.match(host.querySelector('.jk-figure-alt').textContent, /interval unavailable/);
  }
});

test('redraw observer watches childList only, restores steps after vendor resize, and disconnects', () => {
  const ui = load(); const { host, figure } = ui.add(fixture.predictions[0]);
  const observer = ui.observers.find((o) => o.target?.tagName === 'svg');
  assert.deepEqual(Object.keys(observer.options), ['childList']);
  ui.resizes.forEach((fn) => fn()); ui.flush();
  assert.doesNotMatch(host.querySelector('.jk-figure-line').getAttribute('d'), /L/);
  figure.destroy(); assert.equal(observer.target, null);
  assert.equal(host._jkFigure, undefined);
});

test('undocumented history still reserves the sparkline and shows the current band without inventing points', () => {
  const ui = load(); const p = { question: 'Synthetic undated', midpoint: 35, probLow: 30, probHigh: 40 };
  const { host } = ui.add(p);
  assert.equal(host.querySelector('.jk-figure-line'), null);
  assert.equal(host.querySelector('.jk-figure-dot'), null);
  assert.ok(+host.querySelector('.jk-figure-band').getAttribute('height') >= 2);
  assert.match(host.querySelector('.jk-figure-alt').textContent, /history unavailable.*interval from 30 to 40/);
  assert.equal(host.querySelector('.jk-figure-number').textContent, '35');
});

test('a missing value retains history and current interval, omits the endpoint dot and uses English', () => {
  const ui = load(); const { host } = ui.add({ ...fixture.predictions[0], midpoint: null });
  assert.equal(host.querySelector('.jk-figure-dot'), null);
  assert.ok(host.querySelector('.jk-figure-line'));
  assert.ok(host.querySelector('.jk-figure-band'));
  assert.equal(host.querySelector('.jk-figure-number').textContent, 'Unavailable');
});

test('first paint instant, update counts for dur-2/ease-out, marks update immediately and number finishes at 200ms', () => {
  const ui = load(); const p = fixture.predictions[0]; const { host, figure } = ui.add(p);
  const number = host.querySelector('.jk-figure-number');
  assert.equal(number.textContent, '61'); assert.equal(ui.frames.size, 0);
  figure.update({ ...p, midpoint: 40, probLow: 38, probHigh: 42 }, TODAY);
  assert.equal(number.textContent, '61'); assert.equal(ui.frames.size, 1);
  assert.match(host.querySelector('.jk-figure-alt').textContent, /interval from 38 to 42/);
  assert.doesNotMatch(host.querySelector('.jk-figure-line').getAttribute('d'), /L/);
  ui.advance(100); assert.notEqual(number.textContent, '61'); assert.notEqual(number.textContent, '40');
  ui.advance(200); assert.equal(number.textContent, '40'); assert.equal(ui.frames.size, 0); assert.equal(ui.timers.size, 0);
  assert.ok(ui.reads.includes('--jk-dur-2')); assert.ok(ui.reads.includes('--jk-ease-out'));
});

for (const control of ['media', 'class']) {
  test(`${control} reduced motion finishes a count immediately and future updates are instant`, () => {
    const ui = load(); const p = fixture.predictions[0]; const { host, figure } = ui.add(p);
    figure.update({ ...p, midpoint: 40 }, TODAY);
    if (control === 'media') { ui.media.matches = true; ui.media.change(); }
    else { ui.root.classList.add('jk-rm'); ui.observers.filter((o) => o.target === ui.root).forEach((o) => o.fn()); }
    assert.equal(host.querySelector('.jk-figure-number').textContent, '40'); assert.equal(ui.frames.size, 0);
    figure.update({ ...p, midpoint: 45 }, TODAY);
    assert.equal(host.querySelector('.jk-figure-number').textContent, '45'); assert.equal(ui.frames.size, 0);
  });
}
