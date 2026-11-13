const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync('assets/app.js', 'utf8');
const headlineIds = ['nActive', 'nSoon', 'nLinked', 'nGap', 'stDue', 'stHigh', 'stMean', 'stBrier', 'nOpen', 'nOpenMean', 'nBrier'];

function load({ reduced = false, rm = false, duration = '200ms', ease = 'cubic-bezier(0.2, 0, 0, 1)', data } = {}) {
  let now = 0, nextFrame = 0;
  const frames = new Map(), observers = [], listeners = new Map(), tokenReads = [];
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.childNodes = []; this.style = {}; this.dataset = {};
      this.attrs = {}; this.className = ''; this.listeners = {}; this._text = '';
    }
    get textContent() { return this.childNodes.length ? this.childNodes.map(n => n.textContent).join('') : this._text; }
    set textContent(value) { this.childNodes = []; this._text = String(value); }
    set innerHTML(value) {
      assert.ok(!headlineIds.includes(this.id), 'headlines must use safe nodes, never innerHTML');
      this.html = value;
    }
    appendChild(node) { this.childNodes.push(node); return node; }
    insertBefore(node, before) { this.childNodes.splice(this.childNodes.indexOf(before), 0, node); }
    replaceChildren(...nodes) { this.childNodes = nodes; this._text = ''; }
    setAttribute(name, value) { this.attrs[name] = value; }
    querySelectorAll() { return []; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  const ids = Object.fromEntries([...headlineIds, 'cmpActive', 'cmpSoon', 'soon', 'cmpLinked', 'cmpGap',
    'stDueCmp', 'stHighCmp', 'stMeanCmp', 'stBrierCmp', 'domainFilter', 'confFilter', 'cmpOpen',
    'cmpOpenMean', 'grid', 'brierLab', 'cmpBrier', 'resolvedMeta', 'resolved', 'sort', 'q']
    .map(id => { const node = new Element(); node.id = id; return [id, node]; }));
  headlineIds.forEach(id => { const na = new Element('span'); na.className = 'jk-na'; na.textContent = 'No data'; ids[id].appendChild(na); });
  ids.q.value = '';
  const classes = new Set(rm ? ['jk-rm'] : []);
  const root = { lang: 'it', dataset: {}, style: {}, classList: { contains: name => classes.has(name) } };
  const media = { matches: reduced, addEventListener(name, fn) { assert.equal(name, 'change'); this.change = fn; } };
  const document = {
    documentElement: root,
    querySelector: selector => selector.startsWith('#') ? ids[selector.slice(1)] || null : null,
    createElement: tag => new Element(tag),
    addEventListener: (name, fn) => listeners.set(name, fn)
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(source, {
    document, window, addEventListener() {}, matchMedia: () => media,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target, options) { assert.equal(target, root); assert.deepEqual([...options.attributeFilter], ['class']); observers.push(this); }
    },
    fetch: () => data ? Promise.resolve({ ok: true, json: () => data }) : new Promise(() => {}),
    performance: { now: () => now },
    getComputedStyle: () => ({ getPropertyValue(name) {
      tokenReads.push(name);
      return { '--jk-dur-2': duration, '--jk-ease-out': ease }[name] || '';
    } }),
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout() { assert.fail('figure motion must not leave a timer'); }
  });
  return {
    ids, frames, tokenReads, listeners,
    set: window.__predictieMotion.setFigure,
    number: id => ids[id].childNodes.find(node => node.style.display === 'inline-block'),
    advance(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); },
    mediaReduce() { media.matches = true; media.change(); },
    classReduce() { classes.add('jk-rm'); observers.forEach(observer => observer.callback()); },
    ready: () => new Promise(resolve => setImmediate(resolve))
  };
}

const cases = [
  ['nActive', '12', '102', { unit: 'active' }],
  ['nSoon', '2', '3', { unit: 'soon' }],
  ['nLinked', '2', '6', { unit: 'linked' }],
  ['nGap', '+12.3', '−3.4', { family: 'pts', unit: 'pts', mark: 'pos' }],
  ['stDue', '10', '1', {}],
  ['stHigh', '1', '5', { unit: 'high' }],
  ['stMean', '12.3%', '97.8%', { family: 'percent' }],
  ['stBrier', '0.123', '0.456', { family: 'brier', unit: 'Brier' }],
  ['nOpen', '12', '4', {}],
  ['nOpenMean', '60%', '30.5%', { family: 'percent' }],
  ['nBrier', '0.500', '0.125', { family: 'brier', unit: 'Brier' }]
];

for (const [id, old, final, options] of cases) {
  test(`${id}: first assignment is instant; subsequent compatible change finishes exactly at the token duration`, () => {
    const p = load();
    p.set('#' + id, old, options);
    const number = p.number(id);
    assert.equal(number.textContent, old);
    assert.equal(number.style.opacity, '1');
    assert.equal(number.style.fontVariantNumeric, 'tabular-nums');
    assert.equal(p.frames.size, 0);
    const unit = p.ids[id].childNodes.find(n => n.className === 'jk-u');
    if (options.unit) { assert.equal(unit.tagName, 'SPAN'); assert.equal(unit.textContent, options.unit); }
    p.set('#' + id, final, options);
    assert.equal(number.textContent, old, 'start at the previous value');
    assert.equal(p.frames.size, 1);
    p.advance(100);
    assert.notEqual(number.textContent, old);
    assert.equal(number.style.opacity, '1', 'compatible figures count instead of fading');
    if (options.family === 'brier') assert.match(number.textContent, /^\d+\.\d{3}$/);
    if (unit) assert.equal(p.ids[id].childNodes.find(n => n.className === 'jk-u'), unit);
    p.advance(199);
    assert.equal(p.frames.size, 1);
    p.advance(200);
    assert.equal(number.textContent, final);
    assert.equal(p.frames.size, 0);
    assert.ok(p.tokenReads.includes('--jk-dur-2'));
    assert.ok(p.tokenReads.includes('--jk-ease-out'));
    p.advance(400);
    assert.equal(number.textContent, final, 'no stale frame or overshoot');
  });
}

test('the computed curve determines intermediate values, and seconds duration tokens work', () => {
  const p = load(); p.set('#nOpen', '0'); p.set('#nOpen', '1000'); p.advance(100);
  assert.equal(p.number('nOpen').textContent, '878');
  const linear = load({ duration: '0.2s', ease: 'cubic-bezier(0, 0, 1, 1)' });
  linear.set('#nOpen', '0'); linear.set('#nOpen', '1000'); linear.advance(100);
  assert.equal(linear.number('nOpen').textContent, '500', 'read easing instead of hard-coding a curve');
  linear.advance(200); assert.equal(linear.number('nOpen').textContent, '1000');
  const short = load({ duration: '120ms' }); short.set('#nOpen', '0'); short.set('#nOpen', '100'); short.advance(120);
  assert.equal(short.number('nOpen').textContent, '100'); assert.equal(short.frames.size, 0);
});

test('motion cannot exceed the duration cap, and unavailable tokens fall back to an instant update', () => {
  const p = load({ duration: '1s' }); p.set('#nOpen', '0'); p.set('#nOpen', '100'); p.advance(200);
  assert.equal(p.number('nOpen').textContent, '100'); assert.equal(p.frames.size, 0);
  for (const tokens of [{ duration: '' }, { ease: '' }]) {
    const q = load(tokens); q.set('#nOpen', '0'); q.set('#nOpen', '100');
    assert.equal(q.number('nOpen').textContent, '100'); assert.equal(q.frames.size, 0);
  }
});

test('same target is a no-op, including during a count; retargeting starts at the displayed number', () => {
  const p = load(); p.set('#nOpen', '10');
  const label = p.number('nOpen').childNodes[0];
  p.set('#nOpen', '10'); assert.equal(p.frames.size, 0); assert.equal(p.number('nOpen').childNodes[0], label);
  p.set('#nOpen', '1000'); p.advance(80);
  const displayed = p.number('nOpen').textContent;
  const frame = [...p.frames.keys()][0];
  p.set('#nOpen', '1000'); assert.equal([...p.frames.keys()][0], frame);
  p.set('#nOpen', '20'); assert.equal(p.number('nOpen').textContent, displayed); assert.equal(p.frames.size, 1);
  p.advance(180);
  assert.ok(Number(p.number('nOpen').textContent) < Number(displayed));
  assert.ok(Number(p.number('nOpen').textContent) > 20);
  p.advance(280); assert.equal(p.number('nOpen').textContent, '20'); assert.equal(p.frames.size, 0);
});

for (const mode of ['reduced', 'rm']) {
  test(`${mode} makes first, numeric, and non-countable assignments instant`, () => {
    const p = load({ [mode]: true });
    p.set('#nActive', '12', { unit: 'active' }); p.set('#nActive', '1', { unit: 'active' });
    assert.equal(p.number('nActive').textContent, '1');
    p.set('#nActive', null);
    assert.equal(p.number('nActive').textContent, 'No data'); assert.equal(p.number('nActive').style.opacity, '1');
    assert.equal(p.frames.size, 0);
  });
}
for (const reduce of ['mediaReduce', 'classReduce']) {
  for (const next of ['100', null]) {
    test(`${reduce} cancels in-flight ${next === null ? 'fade' : 'count'} immediately`, () => {
      const p = load(); p.set('#nOpen', '10'); p.set('#nOpen', next); p.advance(60); p[reduce]();
      assert.equal(p.number('nOpen').textContent, next === null ? 'No data' : next);
      assert.equal(p.number('nOpen').style.opacity, '1'); assert.equal(p.frames.size, 0);
      p.set('#nOpen', '5'); assert.equal(p.number('nOpen').textContent, '5'); assert.equal(p.frames.size, 0);
    });
  }
}

test('numeric width is a ch high-water mark, excluding the suffix, including signed and percentage text', () => {
  const p = load(); p.set('#nActive', '9', { unit: 'active' });
  const n = p.number('nActive'); assert.equal(n.style.minWidth, '1ch');
  p.set('#nActive', '1000', { unit: 'active' }); assert.equal(n.style.minWidth, '4ch');
  p.advance(200); p.set('#nActive', '1', { unit: 'active' }); p.advance(400);
  assert.equal(n.style.minWidth, '4ch');
  p.set('#nActive', null); p.advance(600); assert.equal(n.style.minWidth, '4ch');
  p.set('#nActive', '2', { unit: 'active' }); p.advance(800); assert.equal(n.style.minWidth, '4ch');
  p.set('#nGap', '+12.3', { family: 'pts', unit: 'pts', mark: 'pos' });
  assert.equal(p.number('nGap').style.minWidth, '5ch');
  p.set('#nOpenMean', '99.9%', { family: 'percent' }); assert.equal(p.number('nOpenMean').style.minWidth, '5ch');
  p.set('#stBrier', null, { family: 'brier' }); p.set('#stBrier', '0.250', { family: 'brier', unit: 'Brier' });
  assert.equal(p.number('stBrier').style.minWidth, '5ch', 'a placeholder must not inflate numeric width');
});

test('fractional percent and point frames reserve their full width before motion begins', () => {
  for (const [family, old, final] of [['percent', '10%', '90%'], ['pts', '+1', '+9'], ['percent', '100%', '90%']]) {
    const p = load(); p.set('#nGap', old, { family }); p.set('#nGap', final, { family });
    const number = p.number('nGap');
    const width = number.style.minWidth;
    for (let time = 1; time < 200; time++) {
      p.advance(time);
      assert.equal(number.style.minWidth, width);
      assert.ok(number.textContent.length <= parseInt(width), `${number.textContent} exceeds ${width}`);
    }
    p.advance(200); assert.equal(number.textContent, final);
  }
});

test('non-countable changes and incompatible families fade only the text over the token duration', () => {
  const p = load(); p.set('#nOpen', null);
  const number = p.number('nOpen');
  assert.equal(number.textContent, 'No data'); assert.equal(number.style.opacity, '1'); assert.equal(p.frames.size, 0);
  p.set('#nOpen', '12'); assert.equal(number.textContent, '12'); assert.equal(number.style.opacity, '0');
  const width = number.style.minWidth;
  p.advance(100); assert.ok(Number(number.style.opacity) > 0 && Number(number.style.opacity) < 1);
  assert.equal(number.style.minWidth, width);
  p.advance(200); assert.equal(number.style.opacity, '1'); assert.equal(p.frames.size, 0);
  p.set('#nOpen', 'Unavailable'); assert.equal(number.style.opacity, '0'); p.advance(400);
  assert.equal(number.textContent, 'Unavailable'); assert.equal(number.childNodes[0].className, 'jk-na');
  p.set('#nOpen', '12'); p.advance(600);
  p.set('#nOpen', '12%', { family: 'percent' }); assert.equal(number.style.opacity, '0'); p.advance(800);
  assert.equal(number.textContent, '12%'); assert.equal(number.style.opacity, '1');
});

test('a newer assignment cancels a fade and its old final value cannot overwrite the new value', () => {
  const p = load(); p.set('#nOpen', '12'); p.set('#nOpen', null); p.advance(40);
  p.set('#nOpen', '7'); assert.equal(p.frames.size, 1); assert.equal(p.number('nOpen').textContent, '7');
  p.advance(240); assert.equal(p.frames.size, 0); assert.equal(p.number('nOpen').style.opacity, '1');
  p.advance(500); assert.equal(p.number('nOpen').textContent, '7');
});

test('unit and gap mark remain real, identical nodes through counts, reversals, fades and no-data recovery', () => {
  const p = load(); const opts = { family: 'pts', unit: 'pts', mark: 'pos' };
  p.set('#nGap', '+12', opts);
  const [mark, number, unit] = p.ids.nGap.childNodes;
  assert.equal(mark.tagName, 'I'); assert.equal(mark.attrs['aria-hidden'], 'true');
  assert.equal(unit.tagName, 'SPAN'); assert.equal(unit.className, 'jk-u');
  p.set('#nGap', '−2.4', { ...opts, mark: 'neg' }); p.advance(50);
  assert.deepEqual(p.ids.nGap.childNodes, [mark, number, unit]); assert.equal(mark.className, 'jk-mark neg');
  assert.equal(unit.textContent, 'pts'); assert.equal(unit.style.opacity, undefined); assert.equal(mark.style.opacity, undefined);
  p.advance(200); p.set('#nGap', null, { family: 'pts' }); p.advance(400);
  assert.equal(mark.style.display, 'none'); assert.equal(unit.style.display, 'none');
  p.set('#nGap', '+1', opts); p.advance(600);
  assert.deepEqual(p.ids.nGap.childNodes, [mark, number, unit]); assert.equal(mark.className, 'jk-mark pos');
  assert.equal(unit.textContent, 'pts'); assert.equal(number.textContent, '+1');
  p.set('#nGap', '+3', { ...opts, unit: '<img src=x onerror=alert(1)>', mark: 'pos onclick=alert(1)' });
  assert.equal(unit.textContent, '<img src=x onerror=alert(1)>'); assert.equal(mark.style.display, 'none');
  p.advance(800);
});

test('actual headline assignments and user filters use the helper while list/card replacements stay instant', async () => {
  const predictions = [
    { id: 'a', domain: 'AI', confidence: 'High', midpoint: 75, horizon: '2026-11-20', staleAfter: '2026-11-01', market: { yesPrice: 60, gapPts: 15 } },
    { id: 'b', domain: 'Macro', confidence: 'Low', midpoint: 25, horizon: '2026-11-22', staleAfter: '2026-11-30' }
  ];
  const p = load({ data: { predictions, resolved: [{ brier: 0.125 }], counts: { resolved: 1 } } });
  await p.ready();
  for (const id of headlineIds) assert.ok(p.number(id), `${id} must use the helper`);
  assert.equal(p.frames.size, 0, 'initial render schedules no figure animation');
  assert.equal(p.ids.nActive.textContent, '2active'); assert.equal(p.ids.nGap.textContent, '+15pts');
  assert.equal(p.ids.stBrier.textContent, '0.125Brier'); assert.equal(p.ids.nOpenMean.textContent, '50%');
  const resolved = p.ids.resolved.html, soon = p.ids.soon.html;
  p.listeners.get('click')({ target: { closest: selector => selector === '[data-domain]' ? { dataset: { domain: 'AI' } } : null } });
  assert.equal(p.number('nOpen').textContent, '2'); assert.equal(p.number('nOpenMean').textContent, '50%');
  assert.equal(p.frames.size, 2, 'only the two filtered figures animate');
  assert.match(p.ids.grid.html, /id="f-a"/); assert.doesNotMatch(p.ids.grid.html, /id="f-b"/);
  assert.equal(p.ids.resolved.html, resolved); assert.equal(p.ids.soon.html, soon);
  p.advance(200); assert.equal(p.number('nOpen').textContent, '1'); assert.equal(p.number('nOpenMean').textContent, '75%');
  p.ids.q.listeners.input({ target: { value: 'no matching question' } });
  assert.match(p.ids.grid.html, /No forecasts match/); p.advance(400);
  assert.equal(p.number('nOpen').textContent, '0'); assert.equal(p.number('nOpenMean').textContent, 'No data');
});

function assertNoChartEntryMotion(script) {
  assert.doesNotMatch(script, /stroke[-_]?dash(?:offset|array)/i);
  assert.doesNotMatch(script, /(?:transition[^;\n]*height|height[^;\n]*transition)/i);
  const chart = script.slice(script.indexOf('  function drawDomains('), script.indexOf('  function renderMarket('));
  assert.ok(chart.length > 0);
  assert.doesNotMatch(chart, /requestAnimationFrame|setTimeout|\banimat(?:e|ion)\b|\btransition\b|opacity/i);
  assert.match(script, /function scheduleChart\(\)[\s\S]*?chartFrame = requestAnimationFrame/);
}
test('domain bars are painted complete without entry animation; the resize coalescer remains', () => {
  assertNoChartEntryMotion(source);
  for (const bad of ['bar.style.strokeDashoffset = 0;', 'bar.style.transition = "height 1s";', 'bar.animate([]);', 'bar.style.opacity = 0;']) {
    const fixture = source.replace('  function drawDomains(box, by, w, h) {', `  function drawDomains(box, by, w, h) {\n${bad}`);
    assert.throws(() => assertNoChartEntryMotion(fixture), assert.AssertionError);
  }
});

function assertNoDeprecatedCurves(text, name) {
  assert.doesNotMatch(text, /--jk-(?:ease-inout|spring)\b/, `${name} uses a deprecated curve`);
}
function ownedAssets(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? ownedAssets(name) : /\.(css|js)$/.test(entry.name) ? [name] : [];
  });
}
function assertNoLiteralDurations(css, name) {
  // Ignore comments and quoted content before inspecting declaration values.
  const declarations = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  for (const [, value] of declarations.matchAll(/(?:^|[;{}])\s*[\w-]+\s*:\s*([^;{}]+)/g)) {
    assert.doesNotMatch(value, /(?<![\w.-])[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?m?s\b/i,
      `${name} must use motion tokens instead of literal durations`);
  }
}
test('all repo-owned CSS assets use tokens for durations', () => {
  const stylesheets = ownedAssets('assets').filter(name => name.endsWith('.css'));
  assert.ok(stylesheets.includes(path.join('assets', 'jaack-local.css')));
  stylesheets.forEach(name => assertNoLiteralDurations(fs.readFileSync(name, 'utf8'), name));
});
test('literal-duration guard rejects time declarations and accepts tokens, dimensions and comments', () => {
  for (const declaration of [
    'transition: opacity 160ms;', 'transition: opacity 0.14s;',
    'transition-duration: .2s;', 'transition-delay: 40ms;',
    'animation: fade 1s ease;', 'animation-duration: 2S;', '--local-duration: 200ms;'
  ]) {
    assert.throws(() => assertNoLiteralDurations(`.sheet { ${declaration} }`, 'fixture'), assert.AssertionError);
  }
  assertNoLiteralDurations(`
    /* transition: opacity 160ms; */
    .sheet { min-height:44px; padding:0 14px; content:"transition: opacity 160ms;";
      transition:opacity var(--jk-dur-2) var(--jk-ease-out); }
    .closing { transition:opacity calc(var(--jk-dur-2) * 0.7) var(--jk-ease-in); }
  `, 'fixture');
});
test('all repo-owned CSS/JS assets avoid deprecated curves; fixtures prove the guard rejects both aliases', () => {
  const assets = ownedAssets('assets'); assert.ok(assets.length > 0);
  assets.forEach(name => assertNoDeprecatedCurves(fs.readFileSync(name, 'utf8'), name));
  for (const alias of ['--jk-ease-inout', '--jk-spring']) {
    for (const fixture of [`.figure { transition: opacity var(--jk-dur-2) var(${alias}); }`, `const ease = getComputedStyle(node).getPropertyValue('${alias}');`]) {
      assert.throws(() => assertNoDeprecatedCurves(fixture, 'fixture'), assert.AssertionError);
    }
  }
});
