// Predictie adapter. The shared JaackFigure release stays unchanged.
(function (root) {
  "use strict";
  const DAY = 86400000;
  const numeric = (n) => typeof n === "number" && Number.isFinite(n);
  const interval = (p) => Array.isArray(p) && p.length === 2 && p.every(numeric) && p[0] <= p[1];
  const midpoint = (band) => interval(band) ? (band[0] + band[1]) / 2 : null;
  function utcDay(value) {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? Math.floor(time / DAY) * DAY : null;
  }

  function history(p, today = new Date().toISOString().slice(0, 10)) {
    const end = utcDay(p.resolvedOn || today);
    const revisions = (p.history || []).map((h, index) => ({ ...h, day: utcDay(h.date), index }))
      .filter((h) => h.day != null && h.day <= end)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.index - b.index);
    const start = utcDay(p.created) ?? revisions[0]?.day;
    const series = [], dates = [];
    // A first revision's `from` is evidence of the opening band. Otherwise
    // leave undocumented days empty; never backfill a later revision.
    let current = revisions.length ? midpoint(revisions[0].from) : (numeric(p.midpoint) ? p.midpoint : null);
    let i = 0;
    if (start != null && end != null) {
      for (let day = start; day <= end; day += DAY) {
        while (i < revisions.length && revisions[i].day <= day) current = midpoint(revisions[i++].to);
        dates.push(new Date(day).toISOString().slice(0, 10));
        series.push(current);
      }
    }
    // The public snapshot is authoritative for the terminal UTC day, even
    // when its midpoint differs from the last recorded interval's centre.
    if (series.length && numeric(p.midpoint)) series[series.length - 1] = p.midpoint;
    return { series, dates, revisions: revisions.length };
  }

  function data(p, today) {
    const h = history(p, today);
    const band = interval([p.probLow, p.probHigh]) ? [p.probLow, p.probHigh] : null;
    const points = h.series.filter(numeric);
    const change = points.length ? points[points.length - 1] - points[0] : 0;
    const trend = Math.abs(change) <= 1 ? "stable" : change > 0 ? "rising" : "falling";
    const since = h.dates.length ? new Date(h.dates[0] + "T12:00:00Z")
      .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
    const window = `full history, ${h.revisions} ${h.revisions === 1 ? "revision" : "revisions"}${since ? `, since ${since}` : ""}`;
    const alt = [points.length ? `${trend}, history minimum ${Math.min(...points)} and maximum ${Math.max(...points)} percent` : "history unavailable",
      band ? `interval from ${band[0]} to ${band[1]} percent` : "interval unavailable", window].join(", ");
    return { label: p.question, value: p.midpoint, formatter: (n) => String(Math.round(n * 10) / 10),
      unit: "%", series: h.series, band, mode: "predictie", threshold: 1, reserveChars: 4, window, alt };
  }

  // Preserve gaps (each M starts a new segment). Horizontal until the change
  // day's x coordinate, then vertical: published forecasts never interpolate.
  function steps(path) {
    return path.replace(/L\s*([-+\d.eE]+)[ ,]+([-+\d.eE]+)/g, "H$1 V$2");
  }

  function init(el, p, today) {
    let next = data(p, today);
    const figure = root.JaackFigure.init(el, next);
    const svg = el.querySelector(".jk-figure-spark");
    // Native summaries already expose their full question in .q.
    if (el.dataset.forecastFigure === "list") el.querySelector(".jk-figure-label").setAttribute("aria-hidden", "true");
    function sync() {
      const group = el.closest("[data-jk-figure-scale]");
      // Vendor intentionally skips an entirely missing history. Keep the
      // current interval visible even when its opening date is undocumented.
      if (next.band && !next.series.some(numeric) && !svg.querySelector(".jk-figure-band")) {
        const bounds = group?._jkFigureScale || next.band;
        const rect = svg.getBoundingClientRect(), style = getComputedStyle(svg);
        const h = rect.height || parseFloat(style.fontSize) * 0.7;
        const w = rect.width || h * 5;
        const pad = (parseFloat(style.getPropertyValue("--jk-figure-dot")) || 3) / 2 + 1;
        const range = bounds[1] - bounds[0];
        const y = (v) => range ? pad + (1 - Math.max(0, Math.min(1, (v - bounds[0]) / range))) * (h - 2 * pad) : h / 2;
        const top = y(next.band[1]), bottom = y(next.band[0]);
        const height = Math.min(Math.max(0, h - 2 * pad), Math.max(2, bottom - top));
        const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const attrs = { class: "jk-figure-band", x: pad, y: Math.max(pad, Math.min(h - pad - height, (top + bottom - height) / 2)),
          width: Math.max(0, w - 2 * pad), height };
        Object.entries(attrs).forEach(([key, value]) => band.setAttribute(key, value));
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.appendChild(band);
      }
      const line = svg.querySelector(".jk-figure-line");
      if (line) {
        const original = line.getAttribute("d"), stepped = steps(original);
        if (stepped !== original) line.setAttribute("d", stepped);
      }
      el.querySelector(".jk-figure-alt").textContent = next.alt;
      if (next.value == null) el.querySelector(".jk-figure-number").textContent = "Unavailable";
      const label = group && document.getElementById(group.dataset.scaleLabel);
      if (label && group._jkFigureScale) label.textContent = `Shared scale ${group._jkFigureScale.join("–")}%`;
    }
    // Vendor resize and group refresh clear svg.textContent and rebuild marks.
    // Observe childList only: changing path d cannot trigger this observer.
    const observer = new MutationObserver(sync);
    observer.observe(svg, { childList: true });
    sync();
    return {
      update(patch, day) { next = data(patch, day); figure.update(next); sync(); },
      destroy() { observer.disconnect(); figure.destroy(); }
    };
  }
  const api = { history, data, steps, init };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PredictieFigure = api;
})(typeof window === "object" ? window : globalThis);
