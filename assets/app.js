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
  const na = () => `<span class="jk-na">nessun dato</span>`;

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

  function paintChrome() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#07090d" : "#f2f5f6");
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
    $("#nActive").innerHTML = `${P.length}<span class="jk-u">active</span>`;
    $("#cmpActive").innerHTML = `updated <b>${esc(fmtStamp(DATA.generatedAt))}</b> · <b>${DATA.counts.resolved || 0}</b> resolved${mean != null ? ` · mean midpoint <b>${fmtP(mean)}</b>` : ""} · ${due ? `<b>${due}</b> due for review` : "none due for review"}`;
    $("#nSoon").innerHTML = `${soon.length}<span class="jk-u">soon</span>`;
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

    $("#nLinked").innerHTML = `${mk.length}<span class="jk-u">linked</span>`;
    $("#cmpLinked").innerHTML = `of <b>${P.length}</b> active forecasts`;
    if (gap == null) {
      $("#nGap").innerHTML = na();
      $("#cmpGap").textContent = "no linked market in the book";
    } else {
      const dir = gap > 0 ? "above the market" : gap < 0 ? "below the market" : "level with the market";
      const mark = gap > 0 ? "pos" : gap < 0 ? "neg" : "";
      $("#nGap").innerHTML = `${mark ? `<i class="jk-mark ${mark}" aria-hidden="true"></i>` : ""}${esc(fmtPts(gap))}<span class="jk-u">pts</span>`;
      $("#cmpGap").innerHTML = `${dir} · <b>${widest.length}</b> ${widest.length === 1 ? "forecast" : "forecasts"} at this gap`;
    }

    $("#stDue").innerHTML = String(due);
    $("#stDueCmp").textContent = due ? `${due} past the review date` : "all inside the review window";
    $("#stHigh").innerHTML = `${high}<span class="jk-u">high</span>`;
    $("#stHighCmp").innerHTML = `<b>${med}</b> medium · <b>${low}</b> low`;
    if (mean == null) {
      $("#stMean").innerHTML = na();
      $("#stMeanCmp").textContent = "";
    } else {
      $("#stMean").innerHTML = fmtP(mean);
      $("#stMeanCmp").innerHTML = `across <b>${P.length}</b> open forecasts`;
    }
    const R = DATA.resolved || [];
    const scored = R.filter((r) => r.brier != null);
    if (!scored.length) {
      $("#stBrier").innerHTML = na();
      $("#stBrierCmp").textContent = R.length ? "resolved, not scored yet" : "nothing scored yet";
    } else {
      const brier = scored.reduce((s, r) => s + Number(r.brier), 0) / scored.length;
      $("#stBrier").innerHTML = `${brier.toFixed(3)}<span class="jk-u">Brier</span>`;
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
      : `<span class="jk-na">nessun dato</span> · no liquid market`;
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
    $("#nOpen").textContent = String(list.length);
    $("#cmpOpen").innerHTML = `of <b>${total}</b> active${bits.length ? " · " + esc(bits.join(" · ")) : ""}`;
    if (mean == null) {
      $("#nOpenMean").innerHTML = na();
      $("#cmpOpenMean").textContent = "no forecasts in view";
    } else {
      $("#nOpenMean").innerHTML = fmtP(mean);
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
      $("#nBrier").innerHTML = na();
      const n = DATA.predictions[0];
      $("#cmpBrier").innerHTML = n ? `Nothing has resolved yet. The first is due around <b>${esc(fmtDate(n.horizon))}</b>.` : "Nothing has resolved yet.";
      $("#resolvedMeta").textContent = "Resolved forecasts";
      $("#resolved").innerHTML = `<p class="jk-note empty-note">Brier scores appear here as forecasts resolve. Each row will show the outcome, the band and the score.</p>`;
      return;
    }
    const mean = scored.length ? scored.reduce((s, r) => s + Number(r.brier), 0) / scored.length : null;
    $("#brierLab").textContent = scored.length > 1 ? "Mean Brier" : "Brier score";
    if (mean == null) {
      $("#nBrier").innerHTML = na();
      $("#cmpBrier").textContent = `${R.length} resolved, not scored yet`;
    } else {
      const latest = R.slice().sort((a, b) => (b.resolvedOn || "").localeCompare(a.resolvedOn || ""))[0];
      $("#nBrier").innerHTML = `${mean.toFixed(3)}<span class="jk-u">Brier</span>`;
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
