# Predictie — World Intelligence Monitor

Static dashboard of Predictie's active forecasts, served by GitHub Pages at
https://predictie.jaack.me. No build step: `index.html` + `assets/` + `data/predictions.json`.

## Design

The canonical source is **iJaack/jaack-design v2.2.0**, commit
`ec751590c3e6c34017e572e57fed11bbf5b8adff`, vendored unchanged in `vendor/jaack/`.
`SOURCE` records the release; `MANIFEST.txt` covers every distributed file,
including the unused fonts. Verify with
`(cd vendor/jaack && shasum -a 256 -c MANIFEST.txt)`; there is no local build step.

Predictie uses the shared tokens, type scale, spacing, components, and `theme.js`.
Light runs from 07:00–18:59 on the visitor's clock, otherwise dark, with an
Auto / Light / Dark override. `?theme=light` or `?theme=dark` previews a theme
when no override is saved. `assets/app.js` relabels the English switch after mount
and joins each visible label with its localized theme-name suffix for exact
accessible names such as "Light, theme". Italian labels remain untouched.

The forecasting layer is `assets/style.css`: cool light paper, the warm Ombra
dark palette, teal probability bands, monospace readings, and separated domain
colours. `assets/jaack-local.css` holds local accessibility and header overrides;
vendored files remain unchanged. It retains the compact wordmark below 481px
and reduces it further at 340px to preserve the vendor switch targets.
`assets/menu.js` moves both section links into a keyboard-accessible Menu sheet
below 505px. That breakpoint is the measured link-fit width with the menu script
blocked; from 505px both links remain in the bar. The tag stays hidden through
644px to address the reported 641–644px mark clipping. Chromium checks (320–900px, light/dark, with/without
`menu.js`) confirm the 504.98px breakpoint (both forced-visible links fit at
505px, fail at 504px) and smallest tag cutoff of 644.98px (645px fits): no clipping
or overlap, including the 320–504px Menu and no-JS fallback, with wordmark glyphs
≥14.8px from the rounded end. At 390×844, the top gap is 14px and chapter two
starts below the fold at y=1438.

`assets/app.js` measures topbar and dock clearance immediately and on size changes;
the vendor CSS fallbacks retain safe-area math. The 390×844 lead chapter minimum
height uses this clearance to keep chapter two below the first viewport.
The chart tooltip override also lives in `assets/app.js`: the canonical component
creates an empty `role="tooltip"` and retains it while hidden. Predictie removes
the role while hidden/empty and supplies a name when shown.

`data/predictions.json`, `scripts/export.py` and `scripts/summaries.json` are the
data pipeline and stay on their own schedule.

`assets/forecast-figure.js` adapts `jk-figure` for the open forecast overview
grid and each native list summary, which remains visible in open details.
One vendor `auto-percent` group includes every forecast currently in view. Its
domain includes daily history values and current interval bounds, adds ±5
percentage points, rounds outward to tens and clamps to 0–100. The English
“Shared scale …” label appears once. Filtering, searching and sorting update the
group; retained rows keep their figure instances and native expanded state.
The grid uses 1/2/3/4 columns at <600/600–1279/1280–2559/≥2560px.
Figures and overview cells keep the vendor's 720px cap; list rows use the full
width. From 1280px, both placements use `--jk-fs-lg` with `--jk-fs-lede` (20px)
as the fallback, preserving the vendor's 5:1 ratio. Open details retain their
0–100 band bar without mounting another figure.

History spans every UTC day from `created` (or the first dated history entry)
through today, or `resolvedOn` for a resolved forecast. Entries describe band
revisions: carry the midpoint of the interval in force forward each day. The
last revision on a UTC day wins. A first entry’s `from` band supplies earlier
opening days when available; undocumented days and missing revisions stay
gaps. With no revisions, a dated opening carries the published midpoint.
The final day always uses the current snapshot `midpoint`, even if it differs
from the latest recorded interval’s centre. Dates are never interpolated.

The adapter converts the vendor’s M/L path to **steps**: horizontal at the
previous value until the next day’s x coordinate, then vertical to that day’s
value. Each M preserves a gap. It runs after init/update and observes SVG
child-list redraws (including resize); path attribute edits cannot loop the
observer. Fewer than two numeric daily points draws no line and retains empty
sparkline space, value and current band, without an insufficient-data label.
Only today’s `probLow`–`probHigh` band is drawn, always at least 2px, never a
history of bands. Null bounds mean no interval: omit the band and say
“interval unavailable” in the English alternative. The existing 0–100 band
bar stays in the detail and also handles absent intervals.

Only value changes count with the vendor’s computed 200ms `--jk-dur-2` /
`--jk-ease-out`; first paint and both reduced-motion controls are instant.
Line, band and dot never animate. The domains chart is unchanged.

## Forma v2 checks

```sh
node --test tests/
python3 -m unittest discover -s tests -p '*_test.py'
python3 tests/forma-v2/contrast.py
(cd vendor/jaack && shasum -a 256 -c MANIFEST.txt)
gitleaks detect --no-banner --redact
gitleaks detect --no-git --no-banner --redact
```

Python tests use only the standard library; JavaScript tests use Node built-ins.
They check the site palette, contrast, clearance wiring, vendor file set and
hashes, menu interactions, English theme labels including late mounts, and headline
number changes (first paint, counts/fades, interruption, reduced motion and widths).
They also guard against chart entry animation and deprecated easing aliases in
repo-owned assets. The existing menu transition stays outside the figure rules.
The palette fixture and contrast checker live in `tests/forma-v2/`; they check
figure value ≥4.5:1 (≥4.6:1 on surface-2) and dot/line ≥3:1 on all three
grounds and their actual band composites. Node figure tests run the unchanged
vendor against a fake DOM and check daily history, shared domains, steps,
missing intervals, resize redraws, cleanup and value motion.

The clearly marked `tests/fixtures/synthetic/predictions.json` contains only
fictional Mercato X/Y/Z and A–H forecasts with deterministic 30-day revision
histories, example.com sources, no real market objects, and two resolved rows.
Mercato Z uses null `probLow`/`probHigh` for an absent interval. X/Y terminal
midpoints intentionally follow the spec’s snapshot values rather than the
centres of their current intervals. X/Y/Z alone share 30–70%; all active
fixture rows share 20–90% on 17 November 2026.

Generate the Mac Playwright capture pack (installed Playwright plus its
Chromium; optionally set `PLAYWRIGHT_MODULE=/path/to/playwright` or
`PLAYWRIGHT_CHANNEL=chrome`):

```sh
node tests/forma-v2/capture-figure.mjs
```

The script serves the static site locally and routes `data/predictions.json`
to the synthetic fixture; the server refuses to serve production JSON. Its
UTC clock is fixed to 17 November 2026. It writes 30 viewport PNGs (list, grid,
open detail × 466×678, 669×951, 1280×800, 2560×1440, 3440×1440 × Light/Ombra)
plus an indexed README, machine-readable layout/step/band/domain checks, and
`measures-r2.json` with question widths and line travel in CSS pixels in
`output/figure-2026-11-17/`. All generated outputs are gitignored.

For a number-change review capture, run in the browser console after loading:

```js
window.__predictieMotion.setFigure("#nActive", "12", { unit: "active" });
window.__predictieMotion.setFigure("#nActive", "28", { unit: "active" });
```

`setFigure(selectorOrElement, formattedNumber, options)` defaults to the `integer`
family. Pass `family: "percent"`, `"pts"`, or `"brier"` for those formatters;
for example `setFigure("#nGap", "−3.5", { family: "pts", unit: "pts", mark: "neg" })`
on `window.__predictieMotion`. `unit` is plain text in a persistent `.jk-u` span;
`mark` accepts `"pos"` or `"neg"`. Pass `null` for the non-countable No data state.
First assignment is instant; subsequent changes use the computed `--jk-dur-2`
and `--jk-ease-out` tokens, capped at 200ms. Both reduced-motion controls make
changes instant. Width reservations grow with the longest formatted reading;
chart bars, card/list values and page sections keep their existing behavior.

## Refreshing data

Data is exported on Predictie's side (no secrets or Actions in this repo):

1. Query the Notion "Predictions & Calibration" data source with the SQL in `scripts/export.py`
   and save the tool output as `.raw-notion.json` (git-ignored).
2. `python3 scripts/export.py .raw-notion.json` → writes `data/predictions.json`.
   New rows need a 1–2 sentence entry in `scripts/summaries.json` (the script lists missing ids).
3. Commit and push `data/predictions.json` (and `scripts/summaries.json` if changed). Pages redeploys automatically.

Only public-safe fields are exported; see the docstring in `scripts/export.py`.

Forecasts only. Not financial advice.
