"""Offline Forma v2 regression checks; Python standard library only."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/forma-v2"
VENDOR = ROOT / "vendor/jaack"


def normalize_color(value):
    value = re.sub(r"\s+", "", value.lower())
    if re.fullmatch(r"#[0-9a-f]{3}", value):
        return "#" + "".join(c * 2 for c in value[1:])
    if value.startswith("rgba("):
        return tuple(float(c) for c in value[5:-1].split(","))
    return value


class FormaV2Test(unittest.TestCase):
    def test_no_pure_black_in_shipped_css(self):
        forbidden = re.compile(
            r"#000\b|#000000|(?<![-\w])black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)"
            r"|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,",
            re.IGNORECASE,
        )
        paths = sorted((ROOT / "assets").glob("*.css"))
        paths += [VENDOR / "jaack.css", VENDOR / "tokens.css"]
        paths += sorted((VENDOR / "components").glob("*.css"))
        for path in paths:
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertIsNone(forbidden.search(path.read_text()))

    def test_page_reserves_fixed_chrome_clearance(self):
        css = (ROOT / "assets/style.css").read_text()
        vendor = (VENDOR / "tokens.css").read_text()
        page = re.search(r"\.jk-page\s*\{([^}]+)\}", css)[1]
        for edge, token, shared in (
            ("top", "--pd-top-clearance", "--jk-top-clearance"),
            ("bottom", "--pd-dock-clearance", "--jk-dock-clearance"),
        ):
            with self.subTest(edge=edge):
                self.assertIn(f"{token}:var({shared});", css)
                self.assertRegex(page, r"padding-" + edge + r":\s*var\(" + token + r"\);")
                fallback = re.search(re.escape(shared) + r":([^;]+);", vendor)[1]
                self.assertIn("env(safe-area-inset-" + edge + ",0px)", fallback)
                self.assertIn("var(--jk-breath)", fallback)
        self.assertIn("--jk-breath:14px", vendor)
        self.assertIn("top:var(--pd-top-clearance)", css)
        self.assertIn("max-height:calc(100dvh - var(--pd-top-clearance) - var(--pd-dock-clearance))", css)
        self.assertIn("#c-book{min-height:calc(100svh - var(--pd-top-clearance));padding-bottom:var(--pd-dock-clearance)}", css)
        self.assertRegex(css, r"\.jk-dock\s*\{[^}]*position:\s*fixed;")

    def test_predictie_palette(self):
        palette = json.loads((FIXTURES / "palettes.json").read_text())["predictie"]
        tokens = {"surface2": "surface-2", "ink2": "ink-2", "accentText": "accent-text", "onAccent": "on-accent"}
        css = (ROOT / "assets/style.css").read_text()
        for theme, colors in palette.items():
            block = re.search(r'html\[data-theme="' + theme + r'"\]\s*\{([^}]+)\}', css)
            self.assertIsNotNone(block, theme)
            declarations = dict(re.findall(r"(--jk-[\w-]+)\s*:\s*([^;]+);", block[1]))
            for name, expected in colors.items():
                token = "--jk-" + tokens.get(name, name)
                with self.subTest(theme=theme, token=token):
                    self.assertIn(token, declarations)
                    self.assertEqual(normalize_color(declarations[token]), normalize_color(expected))

    def test_palette_contrast(self):
        result = subprocess.run(
            [sys.executable, str(FIXTURES / "contrast.py")],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("FAIL: 0", result.stderr)
        for pair, expected in (
            ("ink #e9e4da su bg #130e0b", "15.13"),
            ("t3 rgba(233,228,218,0.58) su surface2 #26201c", "5.19"),
            ("accent #61958e su surface2 #26201c", "4.75"),
            ("onAccent #130e0b su accent #61958e", "5.66"),
            ("accentText #0c5c56 su surface2 #e7eae6", "6.46"),
        ):
            row = next(line for line in result.stdout.splitlines() if pair in line)
            self.assertIn(f"| {expected} | OK |", row)

    def test_no_infinite_site_animation_or_band_gradient(self):
        css = (ROOT / "assets/style.css").read_text()
        self.assertNotRegex(css, r"(?i)\binfinite\b|@keyframes\s+pd-live")
        band = re.search(r"\.band-range\s*\{([^}]+)\}", css)[1]
        self.assertNotIn("gradient(", band)
        self.assertIn("0 0 0 1px var(--jk-ink)", band)

    def test_vendor_matches_release_manifest(self):
        entries = {}
        for line in (VENDOR / "MANIFEST.txt").read_text().splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            self.assertIsNotNone(match, line)
            digest, name = match.groups()
            self.assertNotIn(name, entries)
            entries[name] = digest
        actual = {p.relative_to(VENDOR).as_posix() for p in VENDOR.rglob("*") if p.is_file()}
        self.assertEqual(actual, set(entries) | {"MANIFEST.txt", "SOURCE"})
        self.assertTrue(any(name.startswith("fonts/") for name in entries))
        for name, digest in entries.items():
            with self.subTest(file=name):
                self.assertEqual(hashlib.sha256((VENDOR / name).read_bytes()).hexdigest(), digest)
        self.assertEqual((VENDOR / "SOURCE").read_text().strip(),
                         "iJaack/jaack-design v2.0.0 008ab6f2f0a30091543db16ac70f02cab041338e")

    def test_vendor_uses_warm_forma_tokens(self):
        self.assertIn("--jk-bg:#130e0b", (VENDOR / "tokens.css").read_text())

    def test_site_acceptance_greps(self):
        forbidden = [
            r"#000\b|#000000|:\s*black\b|rgba\(0,\s*0,\s*0",
            r"#(?:14110e|1b1714|231e1a|11100e|191714|13120e|1a1915|15110f|1d1815|15100e|1e1814|161210|1e1916|120f0c|1a1612|12100e|1a1714|f4eee5|cdc3b6|231f1a|ece9e2|c4bfb5|5fd3c3|7fdccf)",
            r"jk-topbar-h",
        ]
        paths = [ROOT / "index.html"] + sorted(
            p for p in (ROOT / "assets").rglob("*") if p.suffix in {".css", ".js", ".html", ".svg"}
        )
        for path in paths:
            for pattern in forbidden:
                with self.subTest(file=path.relative_to(ROOT), pattern=pattern):
                    self.assertNotRegex(path.read_text().lower(), pattern)

    def test_dark_series_and_band(self):
        css = (ROOT / "assets/style.css").read_text()
        dark = re.search(r'html\[data-theme="dark"\]\s*\{([^}]+)\}', css)[1]
        for name, value in {"red": "#c57e5e", "blue": "#6db3e4", "orange": "#f9b64f",
                            "green": "#81e7d3", "purple": "#857eb3", "cyan": "#38bdf8"}.items():
            self.assertIn(f"--jk-c-{name}:{value};", dark)
        self.assertIn("--pd-band-0:#61958e;", dark)
        for declaration in (
            "--jk-hair:rgba(233,228,218,.12)", "--jk-hair-2:rgba(233,228,218,.20)",
            "--jk-edge:rgba(233,228,218,.39)", "--jk-accent-wash:rgba(97,149,142,.12)",
            "--jk-focus:var(--jk-accent-text)", "--jk-glow:rgba(97,149,142,.16)",
        ):
            self.assertIn(declaration + ";", dark)

    def test_menu_markup_and_breakpoint(self):
        html = (ROOT / "index.html").read_text()
        button = re.search(r'<button[^>]*class="pd-menu-toggle"[^>]*>Menu</button>', html)[0]
        for attr in ('type="button"', 'aria-expanded="false"', 'aria-controls="pd-menu"'):
            self.assertIn(attr, button)
        self.assertEqual(html.count('id="pd-menu"'), 1)
        self.assertIn('<script src="assets/menu.js" defer></script>', html)
        self.assertIn('@media (max-width:504.98px)', (ROOT / "assets/jaack-local.css").read_text())
        self.assertIn("matchMedia('(max-width: 504.98px)')", (ROOT / "assets/menu.js").read_text())

    def test_theme_color(self):
        self.assertIn('dataset.theme === "dark" ? "#130e0b" : "#f2f3f1"',
                      (ROOT / "assets/app.js").read_text())

    def test_decorative_numerals_have_no_text_nodes(self):
        html = (ROOT / "index.html").read_text()
        numerals = re.findall(
            r'<span class="jk-deco" aria-hidden="true" data-n="(\d+)"></span>', html,
        )
        self.assertEqual(numerals, ["01", "02", "03", "04"])
        self.assertNotRegex(html, r'class="jk-deco"[^>]*>\s*\d')


if __name__ == "__main__":
    unittest.main()
