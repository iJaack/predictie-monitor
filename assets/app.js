// Measure immediately, independently of forecast loading and switch mount order.
(() => {
  "use strict";
  const root = document.documentElement;
  const bar = document.querySelector("header.jk-top");
  const dock = document.querySelector(".jk-dock");
  const measure = () => {
    if (bar) root.style.setProperty("--jk-top-clearance", (Math.ceil(bar.getBoundingClientRect().bottom) + 14) + "px");
    if (dock) root.style.setProperty("--jk-dock-clearance", (Math.ceil(window.innerHeight - dock.getBoundingClientRect().top) + 14) + "px");
  };
  measure();
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(measure);
    if (bar) observer.observe(bar);
    if (dock) observer.observe(dock);
  }
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
})();

// Site-local English labels; keep the vendor's controls, icons and suffix nodes.
(() => {
  "use strict";
  if (!document.documentElement.lang.startsWith("en")) return;
  const watched = new WeakSet();
  function localize() {
    document.querySelectorAll("[data-jk-theme-switch]").forEach(host => {
      if (watched.has(host)) return;
      watched.add(host);
      let observer;
      function relabel() {
        const group = host.querySelector(".jk-thsw");
        if (!group) return false;
        const theme = window.JaackTheme;
        const labels = {
          auto: ["Auto", `Automatic: light from ${theme.FROM} to ${theme.TO}`],
          light: ["Light", "Light theme"],
          dark: ["Dark", "Dark theme"]
        };
        group.setAttribute("aria-label", "Theme");
        group.querySelectorAll("button[data-m]").forEach(button => {
          const [label, title] = labels[button.dataset.m];
          button.querySelector(".l").textContent = label;
          button.title = title;
          // Avoid Chrome inserting a space before the separately clipped comma.
          const suffix = button.querySelector(".lang-en");
          if (suffix) button.setAttribute("aria-label", label + suffix.textContent);
        });
        if (observer) observer.disconnect();
        return true;
      }
      if (!relabel()) {
        observer = new MutationObserver(relabel);
        observer.observe(host, { childList: true, subtree: true });
      }
    });
  }
  localize();
  document.addEventListener("DOMContentLoaded", localize, { once: true });
})();

(() => {
  "use strict";
  const DOMAINS = ["Geopolitics", "Macro", "Crypto", "Enterprise", "AI"];
  const DKEY = { Geopolitics: "geo", Macro: "macro", Crypto: "crypto", Enterprise: "ent", AI: "ai" };
  const DCOLOR = {
    Geopolitics: "var(--jk-c-red)", Macro: "var(--jk-c-blue)", Crypto: "var(--jk-c-orange)",
    Enterprise: "var(--jk-c-green)", AI: "var(--jk-c-purple)"
  };
  const CONF = ["Low", "Medium", "High"];
  const TZ = "Europe/Rome";
  const state = { domain: "All", conf: "All", sort: "horizon", q: "" };
  let DATA = null;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtP = (x) => (x == null ? "—" : (Math.round(x * 10) / 10).toString().replace(/\.0$/, "") + "%");
  const fmtPts = (n) => {
    if (n == null || Number.isNaN(+n)) return null;
    const v = Math.round(+n * 10) / 10;
    const body = String(Math.abs(v)).replace(/\.0$/, "");
    if (v > 0) return "+" + body;
    if (v < 0) return "−" + body;
    return "0";
  };
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");
  const dot = (domain) => `<i class="dot mk-${DKEY[domain] || "geo"}" aria-hidden="true"></i>`;

  // "today" as a Rome calendar date (YYYY-MM-DD)
  const romeToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dayDiff = (iso) => {
    if (!iso) return null;
    const a = Date.UTC(...romeToday().split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
    const b = Date.UTC(...iso.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
    return Math.round((b - a) / 86400000);
  };
  const fmtDate = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
  const fmtShort = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
  const countdown = (iso) => {
    const d = dayDiff(iso);
    if (d == null) return "";
    if (d < 0) return `${-d}d overdue`;
    if (d === 0) return "resolves today";
    if (d === 1) return "tomorrow";
    if (d < 60) return `in ${d} days`;
    return `in ${Math.round(d / 7)} wks`;
  };
  const fmtStamp = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) + " (Rome)";
  };
  const meanOf = (list) => (list.length ? list.reduce((s, p) => s + (+p.midpoint || 0), 0) / list.length : null);
  const reduced = () => document.documentElement.classList.contains("jk-rm") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Only chapter figures opt in. Units/marks are persistent siblings of the text.
  const figures = new WeakMap();
  const movingFigures = new Set();
  const figureFormats = {
    integer: { pattern: /^-?\d+$/, format: (n) => String(Math.round(n)) },
    percent: { pattern: /^-?\d+(?:\.\d+)?%$/, format: fmtP },
    pts: { pattern: /^[+−-]?\d+(?:\.\d+)?$/, format: fmtPts },
    brier: { pattern: /^\d+\.\d{3}$/, format: (n) => n.toFixed(3) }
  };
  function figureNumber(text, family) {
    return figureFormats[family]?.pattern.test(text) ? Number(text.replace("%", "").replace("−", "-")) : NaN;
  }

  // Evaluate the computed cubic-bezier token, including its x/time coordinates.
  function figureEase(token) {
    const points = token.match(/^cubic-bezier\(([^)]+)\)$/)?.[1].split(",").map(Number);
    if (!points || points.length !== 4 || !points.every(Number.isFinite)) return null;
    const [x1, y1, x2, y2] = points;
    const at = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    return (progress) => {
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (at(t, x1, x2) < progress) lo = t; else hi = t;
      }
      return Math.max(0, Math.min(1, at((lo + hi) / 2, y1, y2)));
    };
  }

  let watchingFigureMotion = false;
  function watchFigureMotion() {
    if (watchingFigureMotion) return;
    watchingFigureMotion = true;
    const finishReduced = () => {
      if (reduced()) movingFigures.forEach((figure) => figure.finish());
    };
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", finishReduced);
    new MutationObserver(finishReduced).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  // setFigure("#nActive", "12", { family: "integer", unit: "active" });
  // Null is the non-countable No data state; other text is always inserted safely.
  function setFigure(target, formatted, { family = "integer", unit = "", mark = "" } = {}) {
    const host = typeof target === "string" ? $(target) : target;
    if (!host) return;
    watchFigureMotion();
    const text = formatted == null ? "No data" : String(formatted);
    mark = mark === "pos" || mark === "neg" ? mark : "";
    let figure = figures.get(host);
    const first = !figure;
    if (!figure) {
      const number = document.createElement("span");
      const label = document.createElement("span");
      number.appendChild(label);
      number.style.display = "inline-block";
      number.style.fontVariantNumeric = "tabular-nums";
      host.replaceChildren(number);
      figure = { number, label, width: 0, frame: 0 };
      figures.set(host, figure);
    }
    if (reduced() && figure.frame) figure.finish();
    if (!first && figure.text === text && figure.family === family && figure.unitText === unit && figure.markText === mark) return;
    const from = figureNumber(figure.number.textContent, figure.family);
    const to = figureNumber(text, family);
    const countable = Number.isFinite(from) && Number.isFinite(to) && Number.isFinite(to - from) && figure.family === family;
    if (figure.frame) cancelAnimationFrame(figure.frame);
    movingFigures.delete(figure);
    figure.frame = 0;
    figure.text = text;
    figure.family = family;
    figure.unitText = unit;
    figure.markText = mark;
    // Whole-number endpoints may still produce fractional percent/point frames.
    const step = Math.sign(to - from) / 10;
    const betweenWidth = countable && step && (family === "percent" || family === "pts")
      ? Math.max(figureFormats[family].format(from + step).length, figureFormats[family].format(to - step).length) : 0;
    figure.width = Math.max(figure.width, Number.isFinite(to) ? text.length : 0, betweenWidth);
    figure.number.style.minWidth = figure.width + "ch";
    figure.label.className = Number.isFinite(to) ? "" : "jk-na";
    if (unit && !figure.unit) {
      figure.unit = document.createElement("span");
      figure.unit.className = "jk-u";
      host.appendChild(figure.unit);
    }
    if (figure.unit) {
      figure.unit.textContent = unit;
      figure.unit.style.display = unit ? "" : "none";
    }
    if (mark && !figure.mark) {
      figure.mark = document.createElement("i");
      figure.mark.setAttribute("aria-hidden", "true");
      host.insertBefore(figure.mark, figure.number);
    }
    if (figure.mark) {
      figure.mark.className = "jk-mark" + (mark ? " " + mark : "");
      figure.mark.style.display = mark ? "" : "none";
    }
    figure.finish = () => {
      if (figure.frame) cancelAnimationFrame(figure.frame);
      figure.frame = 0;
      movingFigures.delete(figure);
      figure.label.textContent = text;
      figure.number.style.opacity = "1";
    };
    if (first || reduced()) { figure.finish(); return; }
    const tokens = getComputedStyle(host);
    const durationToken = tokens.getPropertyValue("--jk-dur-2").trim();
    const duration = Math.min(200, parseFloat(durationToken) * (durationToken.endsWith("ms") ? 1 : 1000));
    const ease = figureEase(tokens.getPropertyValue("--jk-ease-out").trim());
    if (!(duration > 0) || !ease) { figure.finish(); return; }
    if (!countable) figure.label.textContent = text;
    figure.number.style.opacity = countable ? "1" : "0";
    const start = performance.now();
    const tick = (now) => {
      if (reduced() || now - start >= duration) { figure.finish(); return; }
      const progress = ease(Math.max(0, (now - start) / duration));
      if (countable) figure.label.textContent = figureFormats[family].format(from + (to - from) * progress);
      else figure.number.style.opacity = String(progress);
      figure.frame = requestAnimationFrame(tick);
    };
    movingFigures.add(figure);
    figure.frame = requestAnimationFrame(tick);
  }
  window.__predictieMotion = { setFigure };

  function paintChrome() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#130e0b" : "#f2f3f1");
  }

  function domainCounts() {
    const by = {};
    DOMAINS.forEach((d) => { by[d] = 0; });
    (DATA.predictions || []).forEach((p) => { if (by[p.domain] != null) by[p.domain] += 1; });
    return by;
  }

  function renderBook() {
    const P = DATA.predictions;
    const due = P.filter((p) => { const d = dayDiff(p.staleAfter); return d != null && d <= 0; }).length;
    const soon = P.filter((p) => { const d = dayDiff(p.horizon); return d != null && d >= 0 && d <= 14; })
      .sort((a, b) => (a.horizon < b.horizon ? -1 : 1));
    const mean = meanOf(P);
    setFigure("#nActive", String(P.length), { unit: "active" });
    $("#cmpActive").innerHTML = `updated <b>${esc(fmtStamp(DATA.generatedAt))}</b> · <b>${DATA.counts.resolved || 0}</b> resolved${mean != null ? ` · mean midpoint <b>${fmtP(mean)}</b>` : ""} · ${due ? `<b>${due}</b> due for review` : "none due for review"}`;
    setFigure("#nSoon", String(soon.length), { unit: "soon" });
    $("#cmpSoon").innerHTML = soon[0]
      ? `next <b>${esc(fmtShort(soon[0].horizon))}</b> · ${esc(countdown(soon[0].horizon))}`
      : "none in the next 14 days";
    $("#soon").innerHTML = soon.length
      ? soon.map((p) => `<li><button type="button" class="rowbtn" data-jump="${esc(p.id)}" aria-label="${esc(fmtShort(p.horizon))}, ${esc(p.domain)}, ${esc(p.question)}, midpoint ${fmtP(p.midpoint)}">
          <span class="t" title="${esc(countdown(p.horizon))}">${esc(fmtShort(p.horizon))}</span>
          <span class="m jk-opt">${dot(p.domain)}${esc(p.domain)}</span>
          <span class="q">${esc(p.question)}</span>
          <span class="r">${fmtP(p.midpoint)}</span>
        </button></li>`).join("")
      : `<li><span class="t">—</span><span class="m jk-opt"></span><span>None in the next 14 days</span><span class="r">—</span></li>`;
    renderChart();
  }

  function viewportHeight() {
    return (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  }

  function chartHeight(w) {
    const vh = viewportHeight();
    const short = vh <= 520;
    const byWidth = w * (w >= 720 ? 0.32 : 0.42);
    const byHeight = vh * (short ? 0.46 : 0.3);
    return Math.round(Math.max(short ? 124 : 168, Math.min(byWidth, byHeight, short ? 210 : 260)));
  }

  let chartFrame = 0;
  function scheduleChart() {
    if (chartFrame) return;
    chartFrame = requestAnimationFrame(() => {
      chartFrame = 0;
      layoutChart();
    });
  }

  function watchChart() {
    const box = $("#domainChart");
    if (!box || box.dataset.watch) return;
    box.dataset.watch = "1";
    if ("ResizeObserver" in window) new ResizeObserver(scheduleChart).observe(box);
    addEventListener("resize", scheduleChart);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleChart);
  }

  function layoutChart() {
    const box = $("#domainChart");
    if (!box || !DATA) return;
    const w = Math.round(box.clientWidth);
    if (w < 40) return;
    const h = chartHeight(w);
    if (box.dataset.cw === String(w) && box.dataset.ch === String(h) && box.querySelector("svg")) return;
    box.style.height = h + "px";
    box.dataset.cw = String(w);
    box.dataset.ch = String(h);
    const by = domainCounts();
    box.setAttribute("aria-label", "Active forecasts by domain. " + DOMAINS.map((d) => `${d} ${by[d] || 0}`).join(", ") + ".");
    drawDomains(box, by, w, h);
  }

  function renderChart() {
    layoutChart();
  }

  // Canonical tooltip.js creates an empty role=tooltip and only fades it out.
  // Keep hidden/empty chart tooltips out of the accessibility tree, and name
  // the populated tooltip when shown. Leave the vendored component unchanged.
  function fixChartTooltip(tip) {
    if (!tip) return;
    const sync = () => {
      const name = Array.from(tip.childNodes, node => node.textContent).join(" ").trim().replace(/\s+/g, " ");
      if (tip.classList.contains("on") && name) {
        tip.setAttribute("aria-label", name);
        tip.removeAttribute("aria-hidden");
        tip.setAttribute("role", "tooltip");
      } else {
        tip.setAttribute("aria-hidden", "true");
        tip.removeAttribute("role");
        tip.removeAttribute("aria-label");
      }
    };
    new MutationObserver(sync).observe(tip, {
      childList: true, characterData: true, subtree: true,
      attributes: true, attributeFilter: ["class"]
    });
    sync();
  }

  function drawDomains(box, by, w, h) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (n, a) => { const e = document.createElementNS(NS, n); Object.keys(a).forEach((k) => e.setAttribute(k, a[k])); return e; };
    const vals = DOMAINS.map((d) => by[d] || 0);
    const max = Math.max(...vals, 1);
    const top = Math.max(max, 1);
    const pb = 22, pt = 18, right = 30;
    const plot = box.querySelector(".plot") || box;
    const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "xMinYMin meet", role: "img", "aria-hidden": "true" });
    [0, 0.5, 1].forEach((f) => {
      const y = pt + (h - pt - pb) * (1 - f);
      svg.appendChild(el("line", { x1: 0, x2: w - right, y1: y, y2: y, stroke: "var(--jk-hair)" }));
      const t = el("text", { x: w - right + 6, y: y + 4, "font-size": 12, fill: "var(--jk-t2)" });
      t.textContent = String(Math.round(top * f));
      svg.appendChild(t);
    });
    const bw = (w - right) / vals.length;
    const cap = w >= 1000 ? 40 : 56;
    const barW = Math.max(10, Math.min(bw * 0.58, cap));
    const names = bw < 44 ? ["Geo", "Mac", "Cry", "Ent", "AI"] : ["Geo", "Macro", "Crypto", "Ent", "AI"];
    const fs = bw < 64 ? 11 : 12;
    vals.forEach((v, i) => {
      const bh = (h - pt - pb) * (v / top);
      const x = i * bw + (bw - barW) / 2;
      const y = h - pb - bh;
      svg.appendChild(el("rect", {
        x, y, width: barW, height: Math.max(bh, v ? 2 : 0), rx: Math.min(6, barW / 2),
        fill: DCOLOR[DOMAINS[i]], stroke: "var(--jk-ink)", "stroke-width": 1
      }));
      const count = el("text", {
        x: i * bw + bw / 2, y: Math.max(13, y - 5), "text-anchor": "middle",
        "font-size": fs, "font-weight": "650", fill: "var(--jk-ink)"
      });
      count.textContent = String(v);
      svg.appendChild(count);
      const t = el("text", { x: i * bw + bw / 2, y: h - 6, "text-anchor": "middle", "font-size": fs, fill: "var(--jk-t2)" });
      t.textContent = names[i];
      svg.appendChild(t);
    });
    plot.textContent = "";
    plot.appendChild(svg);
    if (window.JaackTip && !box.dataset.scrub) {
      box.dataset.scrub = "1";
      JaackTip.scrub(box, vals.length, (i) => `<span class="d">${esc(DOMAINS[i])}</span><br><b>${vals[i]}</b> <span class="d">active</span>`);
      fixChartTooltip(box.querySelector(".jk-tip"));
    }
  }

  function renderMarket() {
    const P = DATA.predictions;
    const mk = P.filter((p) => p.market && p.market.yesPrice != null);
    const due = P.filter((p) => { const d = dayDiff(p.staleAfter); return d != null && d <= 0; }).length;
    const high = P.filter((p) => p.confidence === "High").length;
    const med = P.filter((p) => p.confidence === "Medium").length;
    const low = P.filter((p) => p.confidence === "Low").length;
    const mean = meanOf(P);
    const gaps = mk.filter((p) => p.market.gapPts != null);
    const maxAbs = gaps.reduce((m, p) => Math.max(m, Math.abs(p.market.gapPts)), 0);
    const widest = gaps.filter((p) => Math.abs(p.market.gapPts) === maxAbs);
    const gap = widest[0] ? widest[0].market.gapPts : null;

    setFigure("#nLinked", String(mk.length), { unit: "linked" });
    $("#cmpLinked").innerHTML = `of <b>${P.length}</b> active forecasts`;
    if (gap == null) {
      setFigure("#nGap", null, { family: "pts" });
      $("#cmpGap").textContent = "no linked market in the book";
    } else {
      const dir = gap > 0 ? "above the market" : gap < 0 ? "below the market" : "level with the market";
      const mark = gap > 0 ? "pos" : gap < 0 ? "neg" : "";
      setFigure("#nGap", fmtPts(gap), { family: "pts", unit: "pts", mark });
      $("#cmpGap").innerHTML = `${dir} · <b>${widest.length}</b> ${widest.length === 1 ? "forecast" : "forecasts"} at this gap`;
    }

    setFigure("#stDue", String(due));
    $("#stDueCmp").textContent = due ? `${due} past the review date` : "all inside the review window";
    setFigure("#stHigh", String(high), { unit: "high" });
    $("#stHighCmp").innerHTML = `<b>${med}</b> medium · <b>${low}</b> low`;
    if (mean == null) {
      setFigure("#stMean", null, { family: "percent" });
      $("#stMeanCmp").textContent = "";
    } else {
      setFigure("#stMean", fmtP(mean), { family: "percent" });
      $("#stMeanCmp").innerHTML = `across <b>${P.length}</b> open forecasts`;
    }
    const R = DATA.resolved || [];
    const scored = R.filter((r) => r.brier != null);
    if (!scored.length) {
      setFigure("#stBrier", null, { family: "brier" });
      $("#stBrierCmp").textContent = R.length ? "resolved, not scored yet" : "nothing scored yet";
    } else {
      const brier = scored.reduce((s, r) => s + Number(r.brier), 0) / scored.length;
      setFigure("#stBrier", brier.toFixed(3), { family: "brier", unit: "Brier" });
      $("#stBrierCmp").innerHTML = `<b>${scored.length}</b> scored · coin flip <b>0.25</b>`;
    }
  }

  function renderFilters() {
    const P = DATA.predictions;
    const cnt = (k, v) => P.filter((p) => p[k] === v).length;
    const dom = $("#domainFilter");
    const conf = $("#confFilter");
    if (!dom.dataset.ready) {
      dom.innerHTML = [`<button type="button" class="chip" data-domain="All">All domains <span class="n">${P.length}</span></button>`]
        .concat(DOMAINS.map((d) => `<button type="button" class="chip" data-domain="${d}">${dot(d)}${d} <span class="n">${cnt("domain", d)}</span></button>`)).join("");
      conf.innerHTML = [`<button type="button" class="chip" data-conf="All">Any confidence</button>`]
        .concat(CONF.map((c) => `<button type="button" class="chip" data-conf="${c}">${c} <span class="n">${cnt("confidence", c)}</span></button>`)).join("");
      dom.dataset.ready = "1";
      conf.dataset.ready = "1";
    }
    dom.querySelectorAll("[data-domain]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.domain === state.domain ? "true" : "false"));
    conf.querySelectorAll("[data-conf]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.conf === state.conf ? "true" : "false"));
  }

  function confBars(c) {
    const n = CONF.indexOf(c) + 1;
    return `<span class="conf" title="Confidence: ${esc(c)}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}<span>${esc(c || "—")}</span></span>`;
  }

  function bandSvg(p) {
    const lo = +p.probLow || 0, hi = +p.probHigh || 0, mid = p.midpoint == null ? (lo + hi) / 2 : +p.midpoint;
    const mkt = p.market && p.market.yesPrice != null ? +p.market.yesPrice : null;
    const left = Math.max(0, Math.min(100, lo));
    const width = Math.max(Math.max(0, Math.min(100, hi)) - left, 0.8);
    const label = `Band ${fmtP(lo)} to ${fmtP(hi)}, midpoint ${fmtP(mid)}${mkt != null ? `, market ${fmtP(mkt)}` : ""}`;
    return `<div class="band" role="img" aria-label="${esc(label)}">
      <div class="band-track">
        <div class="band-range" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></div>
        <div class="band-mid" style="left:${Math.max(0, Math.min(100, mid)).toFixed(2)}%"></div>
        ${mkt != null ? `<div class="band-mkt" style="left:${Math.max(0, Math.min(100, mkt)).toFixed(2)}%"></div>` : ""}
      </div>
      <div class="band-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
    </div>`;
  }

  function outcomeClass(outcome) {
    const o = String(outcome || "").toLowerCase();
    if (o === "yes" || o.endsWith("-yes")) return "ok";
    if (o === "no" || o.endsWith("-no")) return "fail";
    return "";
  }

  function trigClass(label) {
    const l = String(label || "").toLowerCase();
    if (/toward (yes|hike|hold)/.test(l) && !/no hike/.test(l)) return "yes";
    if (/toward (no|no hike)/.test(l)) return "no";
    return "neu";
  }

  function forecast(p) {
    const d = dayDiff(p.horizon);
    const m = p.market;
    const gap = m && m.gapPts != null ? m.gapPts : null;
    const gapCls = gap == null ? "" : Math.abs(gap) < 0.05 ? "" : gap > 0 ? "ok" : "fail";
    const due = dayDiff(p.staleAfter);
    const hist = p.history || [];
    const marketLine = m && m.yesPrice != null
      ? `Market <b>${fmtP(m.yesPrice)}</b>${gap != null ? ` <span class="gap ${gapCls}">${esc(fmtPts(gap))} pts</span>` : ""} · ${m.insideBand ? "inside the band" : "outside the band"}`
      : `<span class="jk-na">No data</span> · no liquid market`;
    return `<details class="fc" id="f-${esc(p.id)}">
      <summary class="fc-line">
        <span class="t"><i class="chev" aria-hidden="true"></i>${esc(fmtShort(p.horizon))}</span>
        <span class="m jk-opt">${dot(p.domain)}${esc(p.domain)}</span>
        <span class="q">${esc(p.question)}</span>
        <span class="c jk-opt">${confBars(p.confidence)}</span>
        <span class="r">${fmtP(p.midpoint)}</span>
      </summary>
      <div class="fc-body">
        <p class="prob-line">Band <b>${fmtP(p.probLow)}–${fmtP(p.probHigh)}</b> · midpoint <b>${fmtP(p.midpoint)}</b> · ${marketLine}</p>
        ${bandSvg(p)}
        <p class="summary">${esc(p.summary)}</p>
        <p class="meta">${confBars(p.confidence)}
          <span>${esc(p.domain)}</span>
          <span title="${esc(countdown(p.horizon))}">${esc(fmtDate(p.horizon))} · ${esc(countdown(p.horizon))}</span>
          <span>Reviewed ${esc(fmtShort(p.lastReviewed))}</span>
          <span class="${due != null && due <= 0 ? "due" : ""}">Re-check by ${esc(fmtShort(p.staleAfter))}${due != null && due <= 0 ? " · due" : ""}</span>
          ${m && m.yesPrice != null ? `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">${esc(m.venue)} ↗</a>${m.asOf ? `<span>price as of ${esc(fmtStamp(m.asOf))}</span>` : ""}` : ""}
        </p>
        <details><summary>Signals to watch <span class="cnt">${(p.triggers || []).length}</span></summary><div class="dbody">
          ${(p.triggers || []).map((t) => `<div class="trig ${trigClass(t.label)}"><b>${esc(t.label)}</b>${esc(t.text)}</div>`).join("") || "<p>No signals listed.</p>"}
        </div></details>
        <details><summary>How it resolves</summary><div class="dbody">${esc(p.resolution)}</div></details>
        <details><summary>Sources <span class="cnt">${(p.sources || []).length}</span></summary><div class="dbody"><ul class="srcs">
          ${(p.sources || []).map((s) => `<li><span><a class="pub" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)}</a>${s.date ? `<span class="dt">${esc(s.date)}</span>` : ""}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</li>`).join("")}
        </ul></div></details>
        <details><summary>Band history <span class="cnt">${hist.length}</span></summary><div class="dbody"><ul class="hist">
          ${hist.slice().reverse().map((h) => `<li><div class="hd"><span class="dt">${esc(fmtShort(h.date))}</span> ${h.from ? `${fmtP(h.from[0])}–${fmtP(h.from[1])} → ` : ""}<b>${fmtP(h.to[0])}–${fmtP(h.to[1])}</b></div>${h.reason ? `<div class="why">${esc(h.reason)}</div>` : ""}</li>`).join("")}
        </ul></div></details>
      </div>
    </details>`;
  }

  function sorted(list) {
    const L = list.slice();
    const k = state.sort;
    const H = (p) => p.horizon || "9999";
    if (k === "horizon") L.sort((a, b) => H(a).localeCompare(H(b)) || b.midpoint - a.midpoint);
    if (k === "horizon-desc") L.sort((a, b) => H(b).localeCompare(H(a)));
    if (k === "prob-desc") L.sort((a, b) => b.midpoint - a.midpoint);
    if (k === "prob") L.sort((a, b) => a.midpoint - b.midpoint);
    if (k === "gap") L.sort((a, b) => Math.abs(b.market?.gapPts ?? -1) - Math.abs(a.market?.gapPts ?? -1));
    if (k === "reviewed") L.sort((a, b) => (b.lastReviewed || "").localeCompare(a.lastReviewed || ""));
    return L;
  }

  function visibleList() {
    const q = state.q.trim().toLowerCase();
    return sorted(DATA.predictions.filter((p) =>
      (state.domain === "All" || p.domain === state.domain) &&
      (state.conf === "All" || p.confidence === state.conf) &&
      (!q || (p.question + " " + (p.summary || "")).toLowerCase().includes(q))));
  }

  function renderOpen() {
    const list = visibleList();
    const total = DATA.predictions.length;
    const mean = meanOf(list);
    const bits = [];
    if (state.domain !== "All") bits.push(state.domain);
    if (state.conf !== "All") bits.push(state.conf + " confidence");
    if (state.q.trim()) bits.push("matching “" + state.q.trim() + "”");
    setFigure("#nOpen", String(list.length));
    $("#cmpOpen").innerHTML = `of <b>${total}</b> active${bits.length ? " · " + esc(bits.join(" · ")) : ""}`;
    if (mean == null) {
      setFigure("#nOpenMean", null, { family: "percent" });
      $("#cmpOpenMean").textContent = "no forecasts in view";
    } else {
      setFigure("#nOpenMean", fmtP(mean), { family: "percent" });
      $("#cmpOpenMean").innerHTML = `across the <b>${list.length}</b> ${list.length === 1 ? "forecast" : "forecasts"} in view`;
    }
    $("#grid").innerHTML = list.length
      ? list.map(forecast).join("")
      : `<p class="jk-note empty-note">No forecasts match these filters.</p>`;
  }

  function renderResolved() {
    const R = DATA.resolved || [];
    const scored = R.filter((r) => r.brier != null);
    if (!R.length) {
      $("#brierLab").textContent = "Brier score";
      setFigure("#nBrier", null, { family: "brier" });
      const n = DATA.predictions[0];
      $("#cmpBrier").innerHTML = n ? `Nothing has resolved yet. The first is due around <b>${esc(fmtDate(n.horizon))}</b>.` : "Nothing has resolved yet.";
      $("#resolvedMeta").textContent = "Resolved forecasts";
      $("#resolved").innerHTML = `<p class="jk-note empty-note">Brier scores appear here as forecasts resolve. Each row will show the outcome, the band and the score.</p>`;
      return;
    }
    const mean = scored.length ? scored.reduce((s, r) => s + Number(r.brier), 0) / scored.length : null;
    $("#brierLab").textContent = scored.length > 1 ? "Mean Brier" : "Brier score";
    if (mean == null) {
      setFigure("#nBrier", null, { family: "brier" });
      $("#cmpBrier").textContent = `${R.length} resolved, not scored yet`;
    } else {
      const latest = R.slice().sort((a, b) => (b.resolvedOn || "").localeCompare(a.resolvedOn || ""))[0];
      setFigure("#nBrier", mean.toFixed(3), { family: "brier", unit: "Brier" });
      $("#cmpBrier").innerHTML = `<b>${scored.length}</b> scored · coin flip is <b>0.25</b>${latest && latest.outcome ? ` · latest <b>${esc(latest.outcome)}</b>` : ""}`;
    }
    $("#resolvedMeta").textContent = `${R.length} resolved${mean != null ? ` · mean Brier ${mean.toFixed(3)}` : ""}`;
    $("#resolved").innerHTML = `<ul class="jk-rows rows-res">
      ${R.map((r) => `<li>
        <span class="c-q">${esc(r.question)}</span>
        <span class="c-out ${outcomeClass(r.outcome)}">${esc(r.outcome || String(r.status || "").replace("Resolved-", ""))}</span>
        <span class="c-brier r">${r.brier != null ? Number(r.brier).toFixed(3) : "—"}</span>
        <span class="c-dom m jk-opt">${dot(r.domain)}${esc(r.domain)}</span>
        <span class="c-band p jk-opt">${fmtP(r.probLow)}–${fmtP(r.probHigh)}</span>
        <span class="c-date t jk-opt">${esc(fmtShort(r.resolvedOn))}</span>
      </li>`).join("")}
    </ul>`;
  }

  function bind() {
    document.addEventListener("click", (e) => {
      const d = e.target.closest("[data-domain]"); if (d) { state.domain = d.dataset.domain; renderFilters(); renderOpen(); }
      const c = e.target.closest("[data-conf]"); if (c) { state.conf = c.dataset.conf; renderFilters(); renderOpen(); }
      const j = e.target.closest("[data-jump]"); if (j) jump(j.dataset.jump);
    });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderOpen(); });
    $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderOpen(); });
  }

  function scrollOffset() {
    const top = document.querySelector(".jk-top");
    return top ? Math.ceil(top.getBoundingClientRect().bottom + 12) : 84;
  }

  function jump(id) {
    state.domain = "All"; state.conf = "All"; state.q = "";
    const q = $("#q"); if (q) q.value = "";
    renderFilters(); renderOpen();
    const el = document.getElementById("f-" + id);
    if (!el) return;
    if ("open" in el) el.open = true;
    el.style.scrollMarginTop = scrollOffset() + "px";
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }

  function initNav() {
    const nav = $("#chap-nav");
    if (!nav || !window.JaackPill) return;
    const ids = ["c-book", "c-market", "c-open", "c-resolved"];
    const P = JaackPill.init(nav, (v) => {
      const s = document.getElementById(v);
      if (!s) return;
      scrollTo({ top: s.getBoundingClientRect().top + scrollY - scrollOffset(), behavior: reduced() ? "auto" : "smooth" });
    });
    if (!P) return;
    addEventListener("scroll", () => {
      let at = ids[0];
      ids.forEach((id) => {
        const s = document.getElementById(id);
        if (s && s.getBoundingClientRect().top < innerHeight * 0.4) at = id;
      });
      P.set(at);
    }, { passive: true });
    requestAnimationFrame(() => P.place());
  }

  paintChrome();
  addEventListener("jaacktheme", paintChrome);
  initNav();
  watchChart();

  fetch("data/predictions.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => {
      DATA = d;
      renderBook(); renderMarket(); renderFilters(); renderOpen(); renderResolved(); bind();
    })
    .catch((err) => {
      const grid = $("#grid");
      if (grid) grid.innerHTML = `<p class="jk-note empty-note"><b>Couldn't load forecasts.</b> ${esc(err.message)}</p>`;
    });
})();
