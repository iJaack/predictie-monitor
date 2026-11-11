# Predictie — World Intelligence Monitor

Static dashboard of Predictie's active forecasts, served by GitHub Pages at
https://predictie.jaack.me. No build step: `index.html` + `assets/` + `data/predictions.json`.

## Design

The canonical source is **iJaack/jaack-design v2.0.0**, commit
`008ab6f2f0a30091543db16ac70f02cab041338e`, vendored unchanged in `vendor/jaack/`.
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

## Forma v2 checks

```sh
python3 -m unittest discover -s tests -p '*_test.py' && node --check assets/app.js && node --check assets/menu.js && node --test tests/*.test.cjs && (cd vendor/jaack && shasum -a 256 -c MANIFEST.txt)
```

Python tests use only the standard library; JavaScript tests use Node built-ins.
They check the site palette, contrast, clearance wiring, vendor file set and
hashes, menu interactions, and English theme labels including late mounts.
The palette fixture and contrast checker live in `tests/forma-v2/`.

## Refreshing data

Data is exported on Predictie's side (no secrets or Actions in this repo):

1. Query the Notion "Predictions & Calibration" data source with the SQL in `scripts/export.py`
   and save the tool output as `.raw-notion.json` (git-ignored).
2. `python3 scripts/export.py .raw-notion.json` → writes `data/predictions.json`.
   New rows need a 1–2 sentence entry in `scripts/summaries.json` (the script lists missing ids).
3. Commit and push `data/predictions.json` (and `scripts/summaries.json` if changed). Pages redeploys automatically.

Only public-safe fields are exported; see the docstring in `scripts/export.py`.

Forecasts only. Not financial advice.
