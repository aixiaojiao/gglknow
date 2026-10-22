# GglKnow store artwork

- `en/screenshots/` and `zh/screenshots/`: three 1280 × 800 screenshots per language, with editable SVG sources and opaque RGB PNG exports.
- `en/` and `zh/`: 1400 × 560 marquee tiles and 440 × 280 small tiles. Chrome's global promotional slots use the English versions; Chinese variants are available for other placements.
- `source/`: actual reader screenshots from the built extension UI, loaded with the public-safe example library in `demo/`. Source content remains English in both interface languages to show that switching the interface does not translate a saved author's words.
- `preview.png`: contact sheet for review.
- `../brand/icon.svg`: editable bookmark identity. All extension icon sizes use this source.

The screenshots show example content, not user archives. There are no private account details, fabricated ratings, video/AI claims, or promises of complete remote-thread collection.

## Rebuild

Capture the built reader at 1280 × 800 after importing `demo/en`. Use the language selector for each locale. Capture the library view and a `portable` search. Keep the `source/reader-{en,zh}.png` and `source/search-{en,zh}.png` paths.

Run `node scripts/render-store.cjs` in an environment that provides `sharp`, or set `GGLKNOW_SHARP_PATH` to its installed module directory. This reproduces all export artwork from the source captures and vector layouts. It does not alter the extension or visit X.

Store screenshots must be opaque, correctly sized RGB PNG files. SVG layouts are review/edit sources and are not uploaded to Chrome Web Store.
