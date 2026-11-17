#!/usr/bin/env node
// Mac capture pack: no npm project/build step, no production JSON access.
// PLAYWRIGHT_MODULE may point to an installed Playwright package directory.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = require('/opt/homebrew/lib/node_modules/playwright');
}
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = path.join(root, 'output/figure-2026-11-17');
const fixturePath = path.join(root, 'tests/fixtures/synthetic/predictions.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.match(fixture.note, /Synthetic/);
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    // Fail closed if the browser route is ever lost; real data is never served.
    if (!file.startsWith(root + path.sep) || file.endsWith('/data/predictions.json')) {
      res.writeHead(403); res.end('Fixture route required'); return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log('Launching synthetic capture browser');
const browser = await playwright.chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), timeout: 30000 });
const captures = [], checks = [], errors = [];
const sizes = [[466, 678], [669, 951], [1280, 800], [2560, 1440], [3440, 1440]];

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function scrollTo(page, selector) {
  await page.locator(selector).evaluate((el) => {
    const top = document.querySelector('.jk-top').getBoundingClientRect().bottom + 18;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - top, behavior: 'instant' });
  });
  await settle(page);
}
async function inspect(page, width, theme) {
  return page.evaluate(({ width, theme }) => {
    const figures = [...document.querySelectorAll('#forecastFigures .jk-figure')];
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push('page overflow');
    for (const figure of figures) {
      const rect = figure.getBoundingClientRect();
      if (rect.width && (rect.left < 0 || rect.right > innerWidth + 0.5)) problems.push('figure overflow');
      if (rect.width && rect.width > 720.5) problems.push('row wider than 720px');
      if (rect.width && figure.scrollWidth > figure.clientWidth + 1) problems.push('figure content overflow');
      const line = figure.querySelector('.jk-figure-line');
      if (line && /L/.test(line.getAttribute('d'))) problems.push('slanted path');
      if (line && !/H.*V/.test(line.getAttribute('d'))) problems.push('missing steps');
      const missing = figure.querySelector('.jk-figure-label').textContent === 'Mercato Z';
      const band = figure.querySelector('.jk-figure-band');
      if (missing && band) problems.push('unexpected band');
      if (missing && !figure.querySelector('.jk-figure-alt').textContent.includes('interval unavailable')) problems.push('missing unavailable alternative');
      if (!missing && (!band || +band.getAttribute('height') < 2)) problems.push('missing or short band');
      if (band && rect.width && band.getBoundingClientRect().height && band.getBoundingClientRect().height < 1.99) problems.push('band below 2 CSS px');
      for (const mark of figure.querySelectorAll('.jk-figure-line,.jk-figure-band,.jk-figure-dot')) {
        const style = getComputedStyle(mark);
        if (style.animationName !== 'none' || style.transitionDuration.split(',').some((d) => parseFloat(d))) problems.push('animated mark');
      }
      for (const bound of figure.querySelectorAll('.jk-figure-min,.jk-figure-max')) {
        if (!bound.hidden) problems.push('repeated domain');
      }
      // Check every band's position against the group's one shared domain.
      if (band) {
        const p = window.__synthetic.predictions.find((p) => p.question === figure.querySelector('.jk-figure-label').textContent);
        const h = +figure.querySelector('svg').getAttribute('viewBox').split(' ')[3], pad = 2.5;
        const y = (v) => pad + (1 - (v - 20) / 70) * (h - 2 * pad);
        const expectedHeight = Math.min(h - 2 * pad, Math.max(2, y(p.probLow) - y(p.probHigh)));
        const expectedTop = Math.max(pad, Math.min(h - pad - expectedHeight, (y(p.probLow) + y(p.probHigh) - expectedHeight) / 2));
        if (Math.abs(+band.getAttribute('height') - expectedHeight) > .01 || Math.abs(+band.getAttribute('y') - expectedTop) > .01) problems.push('inconsistent shared scale');
      }
    }
    const columns = getComputedStyle(document.querySelector('#figureGrid')).gridTemplateColumns.split(' ').length;
    const expected = width < 600 ? 1 : width < 1280 ? 2 : width < 2560 ? 3 : 4;
    if (columns !== expected) problems.push(`columns ${columns}, expected ${expected}`);
    const domain = document.querySelector('#forecastFigures')._jkFigureScale;
    if (String(domain) !== '20,90') problems.push(`domain ${domain}`);
    if (document.querySelector('#forecastScale').textContent !== 'Shared scale 20–90%') problems.push('scale label');
    return { width, theme, columns, domain, figures: figures.length, problems };
  }, { width, theme });
}

try {
  for (const [width, height] of sizes) {
    for (const theme of ['light', 'dark']) {
      console.log(`Checking ${width}×${height} ${theme}`);
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
      page.on('pageerror', (error) => { errors.push(String(error)); console.error(String(error)); });
      await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'));
      await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.route('**/data/predictions.json', (route) => route.fulfill({ path: fixturePath, contentType: 'application/json' }));
      await page.goto(`${origin}/?theme=${theme}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelectorAll('#figureGrid .jk-figure').length === 11);
      await page.evaluate((fixture) => { window.__synthetic = fixture; }, fixture);
      await page.evaluate(() => document.fonts.ready);
      // Verify native summary keyboard behaviour; open the same detail for each capture.
      const summary = page.locator('#f-synthetic-x > summary');
      await summary.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#f-synthetic-x').open);
      await settle(page);
      const check = await inspect(page, width, theme); checks.push(check);
      assert.deepEqual(check.problems, [], JSON.stringify(check));
      for (const [view, selector] of [['grid', '#forecastFigures'], ['list', '#grid'], ['detail', '#f-synthetic-x']]) {
        if (view === 'list') await page.locator('#f-synthetic-x').evaluate((el) => { el.open = false; });
        if (view === 'detail') await page.locator('#f-synthetic-x').evaluate((el) => { el.open = true; });
        await scrollTo(page, selector);
        const name = `${view}-${width}-${theme}.png`;
        await page.screenshot({ path: path.join(output, name) }); captures.push(name);
      }
      // Exercise the actual filter/sort path and retain the original controller.
      await page.evaluate(() => { window.__retained = document.querySelector('#f-synthetic-x .pd-row-figure')._jkFigure; });
      await page.locator('#q').fill('Mercato X'); await settle(page);
      assert.equal(await page.locator('#forecastScale').textContent(), 'Shared scale 30–70%');
      assert.equal(await page.locator('#figureGrid .jk-figure').count(), 1);
      assert.ok(await page.evaluate(() => window.__retained === document.querySelector('#f-synthetic-x .pd-row-figure')._jkFigure));
      await page.locator('#sort').selectOption('prob-desc'); await settle(page);
      assert.ok(await page.evaluate(() => window.__retained === document.querySelector('#f-synthetic-x .pd-row-figure')._jkFigure));
      await page.locator('#q').fill('no synthetic match'); await settle(page);
      assert.equal(await page.locator('#forecastScale').textContent(), 'Shared scale unavailable');
      await page.locator('#q').fill(''); await settle(page);
      assert.equal(await page.locator('#figureGrid .jk-figure').count(), 11);
      assert.equal(await page.locator('#forecastScale').textContent(), 'Shared scale 20–90%');
      // Both reduced-motion controls affect values instantly; marks stay stepped.
      for (const control of ['media', 'class']) {
        if (control === 'media') await page.emulateMedia({ reducedMotion: 'reduce' });
        else await page.evaluate(() => document.documentElement.classList.add('jk-rm'));
        const instant = await page.evaluate((p) => {
          const host = document.querySelector('#f-synthetic-x .pd-row-figure');
          const instance = window.PredictieFigure.init(host, p, '2026-11-17');
          instance.update({ ...p, midpoint: 42 }, '2026-11-17');
          const result = host.querySelector('.jk-figure-number').textContent;
          instance.destroy(); return result;
        }, fixture.predictions[0]);
        assert.equal(instant, '42');
        if (control === 'media') await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'checks.json'), JSON.stringify({ checks, errors, captures }, null, 2) + '\n');
  const table = sizes.map(([w, h]) => `| ${w}×${h} | ${['light', 'dark'].map((theme) => ['list', 'grid', 'detail'].map((view) => `[${view} ${theme}](${view}-${w}-${theme}.png)`).join(' · ')).join(' | ')} |`).join('\n');
  await writeFile(path.join(output, 'README.md'), `# Figure capture pack — 17 November 2026\n\nSynthetic fixture only. UTC clock fixed at 2026-11-17, 12:00. No production JSON served or captured. Dark = Ombra.\n\nRun from the repository root:\n\n\`node tests/forma-v2/capture-figure.mjs\`\n\nUses an installed Playwright (local package, or Mac Homebrew global); override with \`PLAYWRIGHT_MODULE=/path/to/playwright\`. Install its Chromium if needed. Optional \`PLAYWRIGHT_CHANNEL=chrome\` uses installed Mac Chrome. Runtime used: \`${process.env.PLAYWRIGHT_MODULE || "local/Homebrew Playwright"}\`, channel \`${process.env.PLAYWRIGHT_CHANNEL || "bundled Chromium"}\`.\n\n| Viewport | Light | Ombra |\n|---|---|---|\n${table}\n\n## Checks\n\nAll ${checks.length} viewport/theme combinations pass: no horizontal page/figure/content overflow; native summary Enter opens detail; steps present and no L in any line path; current bands ≥2 SVG units/CSS px when visible; absent interval has no band and an English alternative; group domain 20–90 shared by list/grid/detail; no per-row domain labels; columns 1/2/3/4/4; row max 720px; marks never animate. Filtering to X gives 30–70; filtering/sorting retains its controller; empty results and reset work. Both reduced-motion controls make updates instant. Raw checks: [checks.json](checks.json).\n\n## Open points\n\nThe supplied spec file ends at §10 and lacks the named appended revision/Stage 2 sections; the user’s Stage 2 overrides govern. Mercato X/Y terminal midpoints differ from the centres of their current intervals; the terminal snapshot midpoint is authoritative. No unresolved implementation blocker. Captures use Chromium on macOS, not physical-device testing.\n`);
  console.log(`${captures.length} captures; ${checks.length} viewport/theme checks passed. ${output}`);
} finally {
  await browser.close(); await new Promise((resolve) => server.close(resolve));
}
