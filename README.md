# Favicon Collage 🎨

**Turn your browser history into art — a collage woven from the favicons of every site you've visited.**

Every tile is a real favicon. Lay them out chronologically and you get a woven timeline of where your attention went; sort them by colour and they become a gradient; pack them by frequency and your obsessions bloom into the biggest shapes. It started as a way to visualise a year of art "rabbit-hole" browsing, and this repo makes it something anyone can run on their own history.

> 🔒 **100% local.** Your history is read in your own browser and rendered to a canvas on your machine. Nothing is ever uploaded, sent, or stored anywhere. There is no server.

<p align="center">
  <img src="docs/sample-spiral.png" width="32%" alt="spiral">
  <img src="docs/sample-bubbles.png" width="32%" alt="bubbles">
  <img src="docs/sample-treemap.png" width="32%" alt="treemap">
</p>

---

## Two ways to use it

### 1. Browser extension (recommended — no terminal)

A one-page studio inside your browser. Pick a timeframe and a layout, hit **Generate**, **Save PNG**. Works in any Chromium browser: **Chrome, Brave, Edge, Arc, Vivaldi**.

**Install (sideload):**
1. Download / clone this repo.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`, …).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `extension/` folder.
5. Click the new toolbar icon — the studio opens in a tab. The first **Generate** will ask permission to read your history (it never leaves the page).

**Controls**
- **Period** — last 7 / 30 / 90 days, 6 months, year, or all history.
- **Form** — 14 layouts (see below). Switching is instant; favicons aren't reloaded.
- **Favicons / Colour** — a toggle over the artwork. *Favicons* draws the real icons (the homage to favicons as unseen digital design); *Colour* reduces each one to its dominant colour for an abstract field. Same layout, two readings.
- **Index** (left rail) — every domain in your history as a **checklist**, each with its favicon and visit count, sorted by frequency. **Uncheck anything you don't want** (your bank, x.com, whatever) and the collage re-renders live. Your choices are **remembered** across sessions. Bulk helpers: *All / None / Invert*, plus a search box. There is no built in blocklist; no two people's idea of "art" is alike, so you curate it yourself.
- **Cap** — limits tiles for speed; over the cap it samples evenly across the period.
- **Try demo** — see the layouts (and the index) with random tiles before granting any permission.

### 2. Python script (the original method)

For people who'd rather run a script, `scripts/sqlite_mosaic.py` reads the browser's local SQLite files directly:

```bash
pip install pillow
python3 scripts/sqlite_mosaic.py --browser brave --mode spiral --days 90
python3 scripts/sqlite_mosaic.py --browser chrome --days 30
```

(Close the browser first, or it may lock the database — the script copies it to a temp file to be safe.) It ships with `chrono`, `spiral`, and `bubbles`; the extension has all 14.

---

## The layouts

| Mode | What it shows |
|---|---|
| **Chronological grid** | Every tab in visit order — the continuous timeline |
| **Grouped by site** | Identical favicons clustered — the mass of each rabbit hole |
| **Unique sites** | One tile per site, sized by how often you visited |
| **Spiral** | Phyllotaxis (sunflower) disc, chronological from the centre out |
| **Rainbow spiral** | …same, but ordered by colour |
| **Colour spectrum** | Every favicon sorted by hue into a woven gradient |
| **Light → dark** | Sorted by brightness — a tonal ramp |
| **Bubble pack** | Circle-packed sites, each bubble sized by visit count |
| **Treemap** | Proportional rectangles per site, tiled with its icon |
| **Hilbert curve** | Favicons threaded on a space-filling curve — rabbit holes become *territories* |
| **Year calendar** | GitHub-style grid, each day = its dominant site |
| **One icon per day** | The year compressed to one signature favicon per day |
| **One row per day** | Each row a day, ragged edge = how deep you went |
| **Time of day clock** | Polar by hour, showing *when* you browse |

---

## How it works

The whole trick is that your browser already stores two things locally: a list of **history** entries and a cache of the **favicon** bitmap for each site. Join them, drop each favicon into a grid (or spiral, or treemap…), and you have a collage.

**In the extension** (no file access needed):
- [`chrome.history.search`](https://developer.chrome.com/docs/extensions/reference/api/history) returns the URLs, visit counts and last-visit times for your chosen timeframe.
- The MV3 [`_favicon` API](https://developer.chrome.com/docs/extensions/how-to/ui/favicons) (`"favicon"` permission) serves the cached icon for any page URL via `chrome-extension://<id>/_favicon/?pageUrl=…&size=32`. We load each as an `Image` and `drawImage` it onto a `<canvas>`.
- Colour-sorted modes read each icon's average colour with a 1×1 offscreen canvas (`getImageData`). These favicons are same-origin to the extension page, so the canvas isn't tainted.
- `canvas.toBlob()` → download. Done — no network at any point.

**In the Python script** the same data lives in SQLite inside the browser profile:
- `History` → table `urls` (`url`, `last_visit_time`, `visit_count`). Chromium stores time as microseconds since 1601-01-01.
- `Favicons` → `icon_mapping` (page-url → icon id) joined to `favicon_bitmaps` (PNG blobs). We decode the blobs with Pillow and composite.

The rendering math (grid, phyllotaxis, squarified treemap, Hilbert `d2xy`, circle-packing) lives in `extension/renderers.js` and is written as a pure module so it can be unit-tested with colour-only tiles — see `tools/render-test.html`.

---

## Privacy & permissions

- **`history`** — to list the sites to render. Read-only, never transmitted.
- **`favicon`** — to fetch the cached icon images.
- No host permissions, no network requests, no analytics, no remote code. You can read every line; it's ~4 small files.

## Curating what shows

There is no built in blocklist. After you Generate, the **Index** on the left lists every site in your history; uncheck the ones you don't want and the collage updates instantly. Your selections are saved, so you only prune once. (A broad "non art" filter is impossible to get right for everyone, so the tool leaves the choice to you.)

## Repo layout

```
extension/      the browser extension (load this unpacked)
  manifest.json, background.js, studio.html/.css/.js
  renderers.js  ← all 14 layout algorithms (pure, testable)
scripts/        sqlite_mosaic.py, the original SQLite method
tools/          render-test.html, headless render harness
docs/           sample images
```

## License

MIT — see [LICENSE](LICENSE). Make weird things with your browsing history.
