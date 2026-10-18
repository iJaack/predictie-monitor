(() => {
  "use strict";
  const DOMAINS = ["Geopolitics", "Macro", "Crypto", "Enterprise", "AI"];
  const DCOLOR = { Geopolitics: "var(--geo)", Macro: "var(--macro)", Crypto: "var(--crypto)", Enterprise: "var(--ent)", AI: "var(--ai)" };
  const CONF = ["Low", "Medium", "High"];
  const CCOLOR = { Low: "var(--low)", Medium: "var(--med)", High: "var(--high)" };
  const TZ = "Europe/Rome";
  const state = { domain: "All", conf: "All", sort: "horizon", q: "" };
  let DATA = null;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtP = (x) => (x == null ? "—" : (Math.round(x * 10) / 10).toString().replace(/\.0$/, "") + "%");
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

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

  function renderStrip() {
    const P = DATA.predictions;
    const by = DATA.counts.byDomain || {};
    const total = P.length || 1;
    const soon = P.filter((p) => { const d = dayDiff(p.horizon); return d != null && d >= 0 && d <= 14; });
    const mk = P.filter((p) => p.market && p.market.yesPrice != null);
    const div = mk.slice().sort((a, b) => Math.abs(b.market.gapPts) - Math.abs(a.market.gapPts))[0];
    const due = P.filter((p) => { const d = dayDiff(p.staleAfter); return d != null && d <= 0; }).length;
    $("#strip").innerHTML = `
      <div class="stat"><div class="k">Active forecasts</div><div class="v mono">${P.length}<small>${DATA.counts.resolved || 0} resolved</small></div>
        <div class="s">${due ? `${due} due for review` : "all within review window"}</div></div>
      <div class="stat wide"><div class="k">By domain</div>
        <div class="dombar">${DOMAINS.map((d) => by[d] ? `<span style="width:${(by[d] / total) * 100}%;background:${DCOLOR[d]}" title="${d}: ${by[d]}"></span>` : "").join("")}</div>
        <div class="domlegend">${DOMAINS.map((d) => `<span><i class="dot" style="background:${DCOLOR[d]}"></i>${d}<b>${by[d] || 0}</b></span>`).join("")}</div></div>
      <div class="stat"><div class="k">Resolving ≤ 14 days</div><div class="v mono">${soon.length}</div>
        <div class="s">${soon[0] ? `next: ${esc(fmtShort(soon[0].horizon))}` : "none in window"}</div></div>
      <div class="stat"><div class="k">Market-linked</div><div class="v mono">${mk.length}<small>of ${P.length}</small></div>
        <div class="s">${div ? `widest gap ${div.market.gapPts > 0 ? "+" : ""}${div.market.gapPts} pts` : "—"}</div></div>`;
    const upcoming = P.filter((p) => { const d = dayDiff(p.horizon); return d != null && d >= 0 && d <= 14; })
      .sort((a, b) => (a.horizon < b.horizon ? -1 : 1));
    $("#soon").innerHTML = upcoming.length ? `<div class="soon-title"><span class="dot" style="background:var(--warn)"></span>Resolving in the next 14 days</div>
      <div class="soon-inner">${upcoming.map((p) => `<div class="soon-card" data-jump="${esc(p.id)}" tabindex="0">
        <div class="when">${esc(fmtShort(p.horizon))} · ${esc(countdown(p.horizon))}</div>
        <div class="q">${esc(p.question)}</div>
        <div class="p"><span style="color:${DCOLOR[p.domain]}">${esc(p.domain)}</span> · ${fmtP(p.probLow)}–${fmtP(p.probHigh)}</div></div>`).join("")}</div>` : "";
  }

  function renderFilters() {
    const P = DATA.predictions;
    const cnt = (k, v) => P.filter((p) => p[k] === v).length;
    $("#domainFilter").innerHTML = [`<button class="chip" data-domain="All" aria-pressed="${state.domain === "All"}">All domains <span class="n">${P.length}</span></button>`]
      .concat(DOMAINS.map((d) => `<button class="chip" data-domain="${d}" style="--c:${DCOLOR[d]}" aria-pressed="${state.domain === d}"><i class="dot" style="background:${DCOLOR[d]};margin:0"></i>${d} <span class="n">${cnt("domain", d)}</span></button>`)).join("");
    $("#confFilter").innerHTML = [`<button class="chip" data-conf="All" aria-pressed="${state.conf === "All"}">Any confidence</button>`]
      .concat(CONF.map((c) => `<button class="chip" data-conf="${c}" style="--c:${CCOLOR[c]}" aria-pressed="${state.conf === c}">${c} <span class="n">${cnt("confidence", c)}</span></button>`)).join("");
  }

  function confBars(c) {
    const n = CONF.indexOf(c) + 1;
    return `<span class="conf" style="--cc:${CCOLOR[c] || "var(--low)"}" title="Confidence: ${esc(c)}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}${esc(c || "—")}</span>`;
  }

  function bar(p) {
    const lo = p.probLow ?? 0, hi = p.probHigh ?? 0;
    const m = p.market && p.market.yesPrice != null ? p.market.yesPrice : null;
    return `<div class="bar" role="img" aria-label="Band ${fmtP(lo)} to ${fmtP(hi)}${m != null ? `, market ${fmtP(m)}` : ""}">
      <div class="track"></div>
      <div class="band" style="left:${lo}%;width:${Math.max(hi - lo, 0.8)}%"></div>
      <div class="mid" style="left:${p.midpoint}%" title="Midpoint ${fmtP(p.midpoint)}"></div>
      ${m != null ? `<div class="mkt" style="left:${m}%" title="Market ${fmtP(m)}"></div>` : ""}
      <div class="ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div></div>`;
  }

  function trigClass(label) {
    const l = label.toLowerCase();
    if (/toward (yes|hike|hold)/.test(l) && !/no hike/.test(l)) return "yes";
    if (/toward (no|no hike)/.test(l)) return "no";
    return "neu";
  }

  function card(p) {
    const c = DCOLOR[p.domain] || "var(--accent)";
    const d = dayDiff(p.horizon);
    const m = p.market;
    const gap = m && m.gapPts != null ? m.gapPts : null;
    const gapCls = gap == null ? "" : Math.abs(gap) < 0.05 ? "zero" : gap > 0 ? "pos" : "neg";
    const due = dayDiff(p.staleAfter);
    const hist = p.history || [];
    return `<article class="card" id="f-${esc(p.id)}" style="--c:${c}">
      <div class="card-top"><span class="tag">${esc(p.domain)}</span>${confBars(p.confidence)}
        <span class="horizon ${d != null && d >= 0 && d <= 14 ? "soon" : ""}" title="Horizon ${esc(fmtDate(p.horizon))}">${esc(fmtShort(p.horizon))} · ${esc(countdown(p.horizon))}</span></div>
      <h3 class="q">${esc(p.question)}</h3>
      <div class="prob"><span class="big">${fmtP(p.midpoint)}</span><span class="rng">band ${fmtP(p.probLow)}–${fmtP(p.probHigh)}</span>
        ${m && m.yesPrice != null ? `<span class="mk">Market <b>${fmtP(m.yesPrice)}</b><span class="gap ${gapCls}" title="My midpoint minus market">${gap > 0 ? "+" : ""}${gap} pts</span><br><span>${m.insideBand ? "market inside my band" : "market outside my band"}</span></span>` : `<span class="mk">no liquid market</span>`}</div>
      ${bar(p)}
      <p class="summary">${esc(p.summary)}</p>
      <div class="meta"><span>Reviewed ${esc(fmtShort(p.lastReviewed))}</span><span class="${due != null && due <= 0 ? "due" : ""}">Re-check by ${esc(fmtShort(p.staleAfter))}</span>
        ${m ? `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">${esc(m.venue)} ↗</a>${m.asOf ? `<span>price as of ${esc(fmtStamp(m.asOf))}</span>` : ""}` : ""}</div>
      <div class="details">
        <details><summary>Signals to watch <span class="cnt">${p.triggers.length}</span></summary><div class="dbody">
          ${p.triggers.map((t) => `<div class="trig ${trigClass(t.label)}"><b>${esc(t.label)}</b>${esc(t.text)}</div>`).join("")}</div></details>
        <details><summary>How it resolves</summary><div class="dbody">${esc(p.resolution)}</div></details>
        <details><summary>Sources <span class="cnt">${p.sources.length}</span></summary><div class="dbody"><ul class="srcs">
          ${p.sources.map((s) => `<li><span><a class="pub" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)}</a>${s.date ? `<span class="dt">${esc(s.date)}</span>` : ""}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</li>`).join("")}</ul></div></details>
        <details><summary>Band history <span class="cnt">${hist.length}</span></summary><div class="dbody"><ul class="hist">
          ${hist.slice().reverse().map((h) => `<li><div class="hd"><span>${esc(fmtShort(h.date))}</span>${h.from ? `${fmtP(h.from[0])}–${fmtP(h.from[1])} → ` : ""}<b>${fmtP(h.to[0])}–${fmtP(h.to[1])}</b></div>${h.reason ? `<div class="why">${esc(h.reason)}</div>` : ""}</li>`).join("")}</ul></div></details>
      </div></article>`;
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

  function renderGrid() {
    const q = state.q.trim().toLowerCase();
    const list = sorted(DATA.predictions.filter((p) =>
      (state.domain === "All" || p.domain === state.domain) &&
      (state.conf === "All" || p.confidence === state.conf) &&
      (!q || (p.question + " " + p.summary).toLowerCase().includes(q))));
    $("#resultline").textContent = `Showing ${list.length} of ${DATA.predictions.length} active forecasts`;
    $("#grid").innerHTML = list.length ? list.map(card).join("") : `<div class="empty" style="grid-column:1/-1"><b>No forecasts match these filters.</b>Try another domain or confidence level.</div>`;
  }

  function renderResolved() {
    const R = DATA.resolved || [];
    if (!R.length) {
      $("#resolvedMeta").textContent = "Brier scores appear here as forecasts resolve";
      $("#resolved").innerHTML = `<div class="empty"><b>Nothing has resolved yet.</b>The first resolutions are due ${(() => { const n = DATA.predictions[0]; return n ? `around ${esc(fmtDate(n.horizon))}` : "soon"; })()}. Each will show the outcome, my band at resolution and its Brier score.</div>`;
      return;
    }
    const scored = R.filter((r) => r.brier != null);
    const mean = scored.length ? scored.reduce((s, r) => s + r.brier, 0) / scored.length : null;
    $("#resolvedMeta").textContent = `${R.length} resolved${mean != null ? ` · mean Brier ${mean.toFixed(3)}` : ""}`;
    $("#resolved").innerHTML = `<table class="rtable"><thead><tr><th>Question</th><th>Domain</th><th>Band</th><th>Outcome</th><th>Brier</th><th>Resolved</th></tr></thead><tbody>
      ${R.map((r) => `<tr><td>${esc(r.question)}</td><td style="color:${DCOLOR[r.domain]}">${esc(r.domain)}</td><td class="mono">${fmtP(r.probLow)}–${fmtP(r.probHigh)}</td>
      <td>${esc(r.outcome || r.status.replace("Resolved-", ""))}</td><td class="mono">${r.brier != null ? Number(r.brier).toFixed(3) : "—"}</td><td class="mono">${esc(fmtShort(r.resolvedOn))}</td></tr>`).join("")}</tbody></table>`;
  }

  function bind() {
    document.addEventListener("click", (e) => {
      const d = e.target.closest("[data-domain]"); if (d) { state.domain = d.dataset.domain; renderFilters(); renderGrid(); }
      const c = e.target.closest("[data-conf]"); if (c) { state.conf = c.dataset.conf; renderFilters(); renderGrid(); }
      const j = e.target.closest("[data-jump]"); if (j) jump(j.dataset.jump);
    });
    document.addEventListener("keydown", (e) => { const j = e.target.closest && e.target.closest("[data-jump]"); if (j && e.key === "Enter") jump(j.dataset.jump); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
    $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
  }

  function jump(id) {
    state.domain = "All"; state.conf = "All"; state.q = ""; $("#q").value = "";
    renderFilters(); renderGrid();
    const el = document.getElementById("f-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600);
  }

  fetch("data/predictions.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      DATA = d;
      $("#updated").textContent = fmtStamp(d.generatedAt);
      renderStrip(); renderFilters(); renderGrid(); renderResolved(); bind();
    })
    .catch((err) => { $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Couldn't load forecasts.</b>${esc(err.message)}</div>`; });
})();
