"""Offline Forma v2 regression checks; Python standard library only."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
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
        # Inspect shipped site CSS; vendor padding alone does not clear the bars.
        root = re.search(r":root\s*\{([^}]+)\}", css)
        page = re.search(r"\.jk-page\s*\{([^}]+)\}", css)
        self.assertIsNotNone(root)
        self.assertIsNotNone(page)
        for edge, token, min_height, min_offset in (
            ("top", "--pd-top-clearance", 64, 10),
            ("bottom", "--pd-dock-clearance", 48, 16),
        ):
            with self.subTest(edge=edge):
                clearance = re.search(
                    re.escape(token) + r":\s*calc\((\d+)px\s*\+\s*(\d+)px\s*\+\s*"
                    r"env\(safe-area-inset-" + edge + r"(?:,\s*0px)?\)\s*\+\s*14px\);",
                    root[1],
                )
                self.assertIsNotNone(clearance)
                # Cover the bar/pill height and floating offset, then the 14px gap.
                self.assertGreaterEqual(int(clearance[1]), min_height)
                self.assertGreaterEqual(int(clearance[2]), min_offset)
                self.assertRegex(
                    page[1], r"padding-" + edge + r":\s*var\(" + re.escape(token) + r"\);",
                )
        self.assertRegex(css, r"\.jk-dock\s*\{[^}]*position:\s*fixed;")

    def test_predictie_palette(self):
        palette = json.loads((FIXTURES / "palettes.json").read_text())["predictie"]
        tokens = {"ink2": "ink-2", "accentText": "accent-text", "onAccent": "on-accent"}
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

    def test_no_infinite_site_animation_or_band_gradient(self):
        css = (ROOT / "assets/style.css").read_text()
        self.assertNotRegex(css, r"(?i)\binfinite\b|@keyframes\s+pd-live")
        band = re.search(r"\.band-range\s*\{([^}]+)\}", css)[1]
        self.assertNotIn("gradient(", band)
        self.assertIn("0 0 0 1px var(--jk-ink)", band)

    def test_vendor_bundle_is_reproducible(self):
        # Build an isolated copy: never rewrite the shipped bundle during tests.
        scratch = ROOT / ".tmp-forma"
        scratch.mkdir(exist_ok=True)
        try:
            with tempfile.TemporaryDirectory(dir=scratch) as temp:
                copy = Path(temp) / "jaack"
                shutil.copytree(VENDOR, copy)
                result = subprocess.run(
                    ["sh", str(copy / "build.sh")],
                    cwd=ROOT, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                for name in ("jaack.css", "jaack.js"):
                    with self.subTest(bundle=name):
                        self.assertEqual((VENDOR / name).read_bytes(), (copy / name).read_bytes())
        finally:
            if not any(scratch.iterdir()):
                scratch.rmdir()

    def test_vendor_uses_warm_forma_tokens(self):
        self.assertIn("--jk-bg:#14110e", (VENDOR / "tokens.css").read_text())

    def test_decorative_numerals_have_no_text_nodes(self):
        html = (ROOT / "index.html").read_text()
        numerals = re.findall(
            r'<span class="jk-deco" aria-hidden="true" data-n="(\d+)"></span>', html,
        )
        self.assertEqual(numerals, ["01", "02", "03", "04"])
        self.assertNotRegex(html, r'class="jk-deco"[^>]*>\s*\d')


if __name__ == "__main__":
    unittest.main()
