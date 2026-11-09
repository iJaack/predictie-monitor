# Vendored jaack design system

Synced from **iJaack/Jaack**, `assets/jaack-design-system/`, at commit
**e626247 (Forma v2)**. The vendored sources and regenerated bundles are copied
unchanged; no runtime build step is required for GitHub Pages.

The canonical topbar and theme switch supersede the old local narrow-header
patch. Local rules live in `assets/jaack-local.css`, loaded immediately after
`vendor/jaack/jaack.css`: visually hidden bilingual theme-name suffixes,
CSS-generated decorative chapter numerals, and compact wordmark/link sizing
needed to avoid header overlap at 320/360px in both themes. Predictie's palette
and forecasting styles remain in `assets/style.css`. `assets/app.js` joins each
theme button's visible label and localized suffix into an exact accessible name
(Chrome otherwise inserts a space before the comma in the clipped suffix).

The chart tooltip accessibility override lives in `assets/app.js`: canonical
`components/tooltip.js` creates an empty `role="tooltip"` and keeps that role
while hidden. The site removes the role while hidden/empty and sets a name when
shown. This fix should be considered upstream; vendored files are unchanged.

`theme.js` stays a separate blocking script (light from 07:00 to 18:59 local time).
`build.sh` regenerates `jaack.css` and `jaack.js` from `tokens.css` and
`components/`. Do not edit bundles by hand. After syncing, run
`sh vendor/jaack/build.sh`; the CSS bundle must match the canonical `jaack.css`
byte for byte. `screenshots/` is intentionally not vendored.

## File sha256

Generated with `shasum -a 256` (paths relative to `vendor/jaack/`;
this manifest excludes itself).

| File | SHA-256 |
|---|---|
| `README.md` | `6da6dff0f3d8c9dc4ca5a22aa64628c00ff35b3c08d48559e516aa6c1ed3ec59` |
| `build.sh` | `6fe992029cb58575c99ff3f9a8d183d62932e2c64c0ad178a12c96d1c3e0c851` |
| `components/background.css` | `79f8139af56b5149b19d3bbece0cc5c893947bce0ff79a19ab3f42ea4d0d628f` |
| `components/background.html` | `aad3752dbabf02980debd5b5fc3e62b73e54bd2373286e6081012a8f1112544c` |
| `components/background.js` | `a4262b09496139a537e4265c2d8a490a347bc0a627cac86bd1f95812fd18065a` |
| `components/base.css` | `ae76f776b60de7f2a3f1b8768f7a09fed31022dedfe7c52146a68ea419dd8e9c` |
| `components/chapter.css` | `01ede26575a4e8dfee7bccbf18fb029d510ee62868b2b9d8aa4261e0f9b2382d` |
| `components/chapter.html` | `ba8845ee7d16b909049bff7a0fa352a11b377f3aedb222725d611aa57aad2030` |
| `components/fade.js` | `06a1e7ee987789a7e6ca6e8ab5f0b86cf3b0fe718851ca4df24018fcc74914cf` |
| `components/glass.css` | `040ebf0b0d50a90f4ebaacec3c56df01f36ae173ce8268153eb0d01bea85a28d` |
| `components/glass.html` | `53128dc860e1987064d8243576afb05ba8d41a2c6c9575565b1d0376631e37d4` |
| `components/hero.css` | `329a6e8972c64d667048534bbec7ccdd863d937558b9a411fc967c076fef803a` |
| `components/hero.html` | `15f66b496e2d8dd7df20e9c41ab161230566dedfc337bb94d5422d938fc22f38` |
| `components/navpill.css` | `7a121bd5271258d8953ddd585fa6f0f14e079f0f1f7542b02b3191d1be5637e0` |
| `components/navpill.html` | `2d8651de37627904a0efa58f241db49a48f31ae3b4543778b6a1ae603e7e37a4` |
| `components/navpill.js` | `665aa826b643ec291787a056490540272b7af8a9ba0a6e2f75b0fa5eb9fcdfe4` |
| `components/rows.css` | `278a7b2bb208c88a46d45bc8ed95eb85bbf46c3028981ea908e0bd165fcabe08` |
| `components/rows.html` | `5fa59db93a00b4475df6b937531713880dba5951fedea87eda7117358b687e8c` |
| `components/sheet.js` | `9300d779c944011d2091557b4da0427f326ab5cdbbe1759ad870471cbc7012c0` |
| `components/stats.css` | `5ac2de6f1e64a19386db600706b13b655fa9e4921d8c0392dc013f57c39cc4ca` |
| `components/stats.html` | `fadc665aa5cb59d16fcf55cd323c3d9ed3a3104341c2d75c9a7b47709aa9bbe9` |
| `components/themeswitch.css` | `cb75a071ff0795ffbac003ee59115157b1a7a53420155165aa96609c07bf53bc` |
| `components/themeswitch.html` | `e7f264a6affe5db299051870b0d694fe079bf3d1fb3e355195f4c4ce99a28cb4` |
| `components/tooltip.css` | `44576fdd60b5f6035f1d217aad922eb01c28ecc476cf265d70863b5e1e316c88` |
| `components/tooltip.html` | `4587c3b3f01638b900f3aec1292a24b2ec65c3461ce54f9c223dfa14c43f9b79` |
| `components/tooltip.js` | `b960dcab8ffecf16118b9e1f19c3549e60a679535c1c5f23a56208839a6eb6d0` |
| `components/topbar.css` | `31078a4a2bca87eea57defee817557eb6f0bd91221d22487f8677dc66fbf20da` |
| `components/topbar.html` | `db0dcd133bf692a5ff9b5c8037be5c9c709abe80b97ade2a6fa7d757719d2467` |
| `demo.html` | `669bf4522e8276f64732b7db36454afec183997092c7204edf615a072fec35cd` |
| `demo.js` | `65c0a7f60e08a617be676e0416506944b778a8707bf5f09138fec345b2ade3e3` |
| `jaack.css` | `fd35a96d50b6255c6f6772d20e130831de8c704edaf455d6676e3f0ea478be96` |
| `jaack.js` | `0e5b832cc9f88ad4848d2738713d11faecf375f46844238276b7991d3d945c1a` |
| `theme.js` | `095b0b8bd0cb1c7e4f531dc2164745dc30e63f96df4514a1081462718a3f9cf4` |
| `tokens.css` | `cdf6bbb650c61688a226a5deb2834d165fe853110becde7484c3e64357dd9d50` |
