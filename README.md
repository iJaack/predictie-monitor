# Predictie — World Intelligence Monitor

Static dashboard of Predictie's active forecasts, served by GitHub Pages at
https://predictie.jaack.me. No build step: `index.html` + `assets/` + `data/predictions.json`.

## Design

Forma is vendored in `vendor/jaack/` and left unmodified (see `VENDOR.md` for the
package date and the zip sha256). Predictie uses the shared foundations only:
the token structure, the type scale, the spacing, and `theme.js`. Light runs
from 07:00–18:59 on the visitor's clock, otherwise dark, with an Auto / Chiaro /
Scuro override. `?theme=light` or `?theme=dark` previews a theme when no
override is saved.

The forecasting layer is `assets/style.css`. It keeps the monitor's teal signal
instead of Forma's gold, cools the ground, draws probability bands teal to cyan,
sets readings in monospace, and restores the original domain colours. `assets/app.js`
only changes how forecasts are drawn. `data/predictions.json`, `scripts/export.py`
and `scripts/summaries.json` are the data pipeline and stay on their own schedule.

## Refreshing data

Data is exported on Predictie's side (no secrets or Actions in this repo):

1. Query the Notion "Predictions & Calibration" data source with the SQL in `scripts/export.py`
   and save the tool output as `.raw-notion.json` (git-ignored).
2. `python3 scripts/export.py .raw-notion.json` → writes `data/predictions.json`.
   New rows need a 1–2 sentence entry in `scripts/summaries.json` (the script lists missing ids).
3. Commit and push `data/predictions.json` (and `scripts/summaries.json` if changed). Pages redeploys automatically.

Only public-safe fields are exported; see the docstring in `scripts/export.py`.

Forecasts only. Not financial advice.
