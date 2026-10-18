#!/usr/bin/env python3
"""Export Predictie's Notion 'Predictions & Calibration' rows to data/predictions.json.

Runs on Predictie's side (never in GitHub Actions; no secrets live in this repo).

Input: the JSON returned by the Notion MCP `notion-query-data-sources` tool in SQL
mode, i.e. {"results": [row, ...], ...}, using this query against
collection://90be7667-74f5-4d17-96d8-6135c0aa76f9:

    SELECT url, "Title", "Domain", "Status", "Confidence", "Prob Low", "Prob High",
      "date:Horizon:start", "date:Stale After:start", "date:Last Reviewed:start",
      "Triggers", "Invalidation", "Sources", "Calibration Notes", "Outcome",
      "Brier Score", "date:Resolved On:start", "Created"
    FROM "collection://90be7667-74f5-4d17-96d8-6135c0aa76f9"
    ORDER BY "date:Horizon:start"

Usage:
    python3 scripts/export.py /path/to/notion-query-output.json [--out data/predictions.json]

Public-safety rules (enforced here, not just by convention):
  * Only whitelisted fields are exported. "Decision Relevance", "Routed To" and
    "Non-action Statement" are never read.
  * Internal Notion URLs/page ids are never exported. Each row's `id` is the first
    10 hex chars of sha1(<notion page id>): stable, but not reversible.
  * Any sentence or clause matching SENSITIVE (portfolio/sizing/routing notes,
    plus private terms kept outside the repo) is dropped from free text.
  * The 1-2 sentence plain-English `summary` comes from scripts/summaries.json,
    keyed by `id`. Rows without one get a fallback and are listed on stderr so a
    summary can be written.

Output shape (data/predictions.json):
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-18T15:30:00+02:00",      # ISO 8601, Europe/Rome
  "timezone": "Europe/Rome",
  "counts": {"active": int, "resolved": int, "byDomain": {"Macro": int, ...}},
  "predictions": [Prediction, ...],               # Status Active or Stale
  "resolved":    [Prediction, ...]                # Resolved-Yes / Resolved-No
}
Prediction = {
  "id": "05b7a22d0a",
  "question": str,                 # title without the trailing "(Polymarket ...)" note
  "domain": "Geopolitics|Macro|Crypto|Enterprise|AI",
  "status": "Active|Stale|Resolved-Yes|Resolved-No",
  "confidence": "Low|Medium|High",
  "probLow": 55.0, "probHigh": 70.0, "midpoint": 62.5,   # percent
  "horizon": "YYYY-MM-DD", "staleAfter": "YYYY-MM-DD", "lastReviewed": "YYYY-MM-DD",
  "created": "YYYY-MM-DD",
  "summary": str,
  "triggers": [{"label": "Toward yes", "text": str}, ...],
  "resolution": str,               # the row's Invalidation / resolution criteria
  "market": null | {"venue": "Polymarket", "name": str, "url": str,
                    "yesPrice": 78.5, "asOf": "2026-10-18T14:56:00+02:00",
                    "gapPts": -1.5, "insideBand": bool},   # gap = midpoint - market
  "sources": [{"publisher": str, "date": str|null, "note": str, "url": str}, ...],
  "history": [{"date": "YYYY-MM-DD", "from": [40,55]|null, "to": [55,70], "reason": str}],
  "outcome": null|"Yes"|"No"|"Partial"|"N/A", "brier": null|float, "resolvedOn": null|str
}
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
ROME = ZoneInfo("Europe/Rome")
import os

# Generic sensitive markers. Extra private terms (agent names, people) are read from
# scripts/.private-terms (git-ignored, one term per line) or PREDICTIE_PRIVATE_TERMS
# (comma-separated) so they never live in this public repo.
_BASE = [r"(?<!crypto-)(?<!bitcoin-)treasur", r"sizing", r"allocation", r"\bNAV\b",
         r"routed", r"notion\.(?:so|com)"]
_terms_file = Path(__file__).resolve().parent / ".private-terms"
_extra = [t.strip() for t in os.environ.get("PREDICTIE_PRIVATE_TERMS", "").split(",") if t.strip()]
if _terms_file.exists():
    _extra += [t.strip() for t in _terms_file.read_text().splitlines() if t.strip() and not t.startswith("#")]
SENSITIVE = re.compile("|".join(_BASE + [r"\b" + re.escape(t) + r"\b" for t in _extra]), re.I)
MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
DATE_RE = re.compile(rf"\b(?:{MONTHS})[a-z]*\.? \d{{1,2}}(?:[–-]\d{{1,2}})?,? \d{{4}}\b|\b(?:{MONTHS})[a-z]* \d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b")


def pct(x):
    return None if x is None else round(float(x) * 100, 2)


def day(s):
    return s[:10] if s else None


def scrub(text, clauses=False):
    """Drop sentences (or ';'-separated clauses) that touch sensitive topics."""
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    keep = []
    for p in parts:
        if not SENSITIVE.search(p):
            keep.append(p)
        elif clauses:
            sub = [c for c in re.split(r";\s+", p) if not SENSITIVE.search(c)]
            if sub:
                keep.append("; ".join(sub))
    return " ".join(keep).strip()


def split_title(title):
    m = re.match(r"^(.*?\?)\s*\((Polymarket[^)]*(?:\)[^)]*)?)\)\s*$", title.strip())
    return (m.group(1).strip(), m.group(2)) if m else (title.strip(), None)


def parse_triggers(text):
    text = scrub(text, clauses=True)
    segs = re.split(r"(Toward [^:]{1,40}):", text)
    out = []
    for i in range(1, len(segs) - 1, 2):
        body = segs[i + 1].strip().rstrip(".").strip()
        if body:
            out.append({"label": segs[i].strip(), "text": body + "."})
    return out or ([{"label": "Signals", "text": text}] if text else [])


SRC_RE = re.compile(r"^\s*(\d+)\)\s*(.+?):\s*(https?://\S+?)\s*$")


def parse_sources(text):
    sources, market = [], None
    for line in (text or "").replace("<br>", "\n").splitlines():
        m = SRC_RE.match(line)
        if not m:
            continue
        body, url = m.group(2), m.group(3)
        if SENSITIVE.search(body) or "notion." in url:
            continue
        publisher = re.split(r",| \(| –| - ", body, maxsplit=1)[0].strip()
        dm = DATE_RE.search(body)
        note = body.split(" – ", 1)[1].strip() if " – " in body else ""
        if "polymarket.com" in url and market is None:
            market = parse_market(body, url)
            note = note or "Market rules and price"
        sources.append({"publisher": publisher, "date": dm.group(0) if dm else None,
                        "note": note, "url": url})
    return sources, market


def parse_market(body, url):
    name = re.search(r"'([^']+)'", body)
    price = re.search(r"Yes (\d?\.\d+)", body)
    ts = re.search(rf"((?:{MONTHS}) \d{{1,2}} \d{{4}}) ~?(?:\d{{1,2}}:\d{{2}}[–-])?(\d{{1,2}}:\d{{2}}) Rome", body)
    as_of = None
    if ts:
        t = dt.datetime.strptime(f"{ts.group(1)} {ts.group(2)}", "%b %d %Y %H:%M").replace(tzinfo=ROME)
        as_of = t.isoformat()
    return {"venue": "Polymarket", "name": name.group(1) if name else None, "url": url,
            "yesPrice": pct(float(price.group(1))) if price else None, "asOf": as_of}


BAND_RE = re.compile(r"Band(?: \w+)? (\d?\.\d+)\s*[–-]\s*(\d?\.\d+) → (\d?\.\d+)\s*[–-]\s*(\d?\.\d+)")


def parse_history(notes, created, lo, hi):
    hist = []
    for chunk in re.split(r"(?=\b\d{4}-\d{2}-\d{2}:)", notes or ""):
        m = BAND_RE.search(chunk)
        if not m:
            continue
        d = re.match(r"(\d{4}-\d{2}-\d{2})", chunk)
        reason = BAND_RE.sub("Band moved", chunk)
        reason = re.sub(r"Band moved(?! (?:for|because|to|as)\b)\s*(\(confidence stays \w+\))?\.?", "", reason)
        reason = re.sub(r"^\d{4}-\d{2}-\d{2}:\s*", "", reason)
        reason = re.sub(r"\(confidence stays \w+\)\.?", "", reason)
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", reason.strip())
                     if s and not re.search(r"Sources|4-source cap|re-verified", s)]
        reason = scrub(" ".join(sentences)).strip(" .")
        frm = [pct(float(m.group(1))), pct(float(m.group(2)))]
        to = [pct(float(m.group(3))), pct(float(m.group(4)))]
        hist.append({"date": d.group(1) if d else None, "from": frm, "to": to,
                     "reason": (reason + ".") if reason else ""})
    first = hist[0]["from"] if hist else [lo, hi]
    hist.insert(0, {"date": created, "from": None, "to": first, "reason": "Forecast opened."})
    return hist


def row_to_prediction(r, summaries, missing):
    page_id = r["url"].rstrip("/").rsplit("/", 1)[-1].split("?")[0].replace("-", "")
    pid = hashlib.sha1(page_id.encode()).hexdigest()[:10]
    question, _ = split_title(r.get("Title") or "")
    lo, hi = pct(r.get("Prob Low")), pct(r.get("Prob High"))
    mid = round((lo + hi) / 2, 2) if lo is not None and hi is not None else None
    sources, market = parse_sources(r.get("Sources"))
    if market and market.get("yesPrice") is not None and mid is not None:
        market["gapPts"] = round(mid - market["yesPrice"], 1)
        market["insideBand"] = lo <= market["yesPrice"] <= hi
    summary = summaries.get(pid)
    if not summary:
        missing.append((pid, question))
        summary = question
    return {
        "id": pid, "question": question, "domain": r.get("Domain"), "status": r.get("Status"),
        "confidence": r.get("Confidence"), "probLow": lo, "probHigh": hi, "midpoint": mid,
        "horizon": day(r.get("date:Horizon:start")), "staleAfter": day(r.get("date:Stale After:start")),
        "lastReviewed": day(r.get("date:Last Reviewed:start")), "created": day(r.get("Created")),
        "summary": summary, "triggers": parse_triggers(r.get("Triggers")),
        "resolution": scrub(r.get("Invalidation")), "market": market, "sources": sources,
        "history": parse_history(r.get("Calibration Notes"), day(r.get("Created")), lo, hi),
        "outcome": r.get("Outcome"), "brier": r.get("Brier Score"),
        "resolvedOn": day(r.get("date:Resolved On:start")),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("notion_json")
    ap.add_argument("--out", default=str(ROOT / "data" / "predictions.json"))
    a = ap.parse_args()
    raw = json.loads(Path(a.notion_json).read_text())
    rows = raw["results"] if isinstance(raw, dict) else raw
    summaries = json.loads((ROOT / "scripts" / "summaries.json").read_text())
    missing = []
    preds = [row_to_prediction(r, summaries, missing) for r in rows]
    active = [p for p in preds if p["status"] in ("Active", "Stale")]
    resolved = [p for p in preds if p["status"] in ("Resolved-Yes", "Resolved-No")]
    active.sort(key=lambda p: (p["horizon"] or "9999", p["question"]))
    resolved.sort(key=lambda p: p["resolvedOn"] or "", reverse=True)
    by_domain = {}
    for p in active:
        by_domain[p["domain"]] = by_domain.get(p["domain"], 0) + 1
    out = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(ROME).replace(microsecond=0).isoformat(),
        "timezone": "Europe/Rome",
        "counts": {"active": len(active), "resolved": len(resolved), "byDomain": by_domain},
        "predictions": active, "resolved": resolved,
    }
    blob = json.dumps(out, ensure_ascii=False, indent=1)
    if SENSITIVE.search(blob):
        sys.exit("refusing to write: sensitive string found in output")
    Path(a.out).write_text(blob + "\n")
    print(f"wrote {a.out}: {len(active)} active, {len(resolved)} resolved")
    for pid, q in missing:
        print(f"MISSING SUMMARY {pid}: {q}", file=sys.stderr)


if __name__ == "__main__":
    main()
