<p align="center"><img src="docs/banner.jpg" width="100%" alt="Favicon Collage"></p>

# Favicon Collage

**Turn your browser history into a collage made from the favicons of every site you have visited.**

Every tile is a real favicon. Lay them out in order and you get a woven timeline of where your attention went. Sort them by colour and they become a gradient. Pack them by how often you visited and your obsessions bloom into the biggest shapes.

<p align="center">
  <img src="docs/sample-spiral.png" width="49%" alt="spiral">
  <img src="docs/example-treemap.png" width="49%" alt="treemap">
</p>

<p align="center"><a href="https://chromewebstore.google.com/detail/favicon-collage/fnlbaoakcopohleghenajjlmgkbbdhbm"><b>Add to Chrome</b></a></p>

> **Everything stays on your machine.** Your history is read inside your own browser and drawn to a canvas locally. Nothing is uploaded or stored anywhere. There is no server.

---

## Install

[**Add to Chrome**](https://chromewebstore.google.com/detail/favicon-collage/fnlbaoakcopohleghenajjlmgkbbdhbm) from the Chrome Web Store. It works in Chrome, Brave, Edge, Arc, Vivaldi, and Opera. Open it from the toolbar icon, press **Generate**, and the first time your browser asks to read your history click **Allow**. That reading happens on the page and is never sent anywhere.

### Or load it from this repo

To run the newest version straight from the source, or to tinker with it:

1. Click the green **Code** button above, choose **Download ZIP**, and unzip it.
2. Open your extensions page (`chrome://extensions`, `brave://extensions`, or `edge://extensions`) and turn on **Developer mode** in the top right.
3. Click **Load unpacked** and choose the `extension` folder inside the unzipped folder.

## How it works

Your browser already keeps two things on disk: your **history** and a cache of each site's **favicon**. The extension joins them and draws each favicon onto a canvas.

- [`chrome.history.search`](https://developer.chrome.com/docs/extensions/reference/api/history) returns the urls, visit counts, and last visit times for the period you pick.
- The MV3 [`_favicon` API](https://developer.chrome.com/docs/extensions/how-to/ui/favicons) serves the cached icon for any page, which the studio loads and draws.
- Colour modes read each icon's average colour from a 1×1 canvas. The icons are same origin to the page, so the canvas stays readable and **Save PNG** works.
- Nothing leaves the page at any point.

The layout math lives in `extension/renderers.js` as a pure module, so it can be tested on its own (see `tools/render-test.html`).

## Permissions

- `history` lists the sites to render. It is only read, never sent.
- `favicon` loads the cached icons.
- `storage` remembers which sites you unchecked.

No host permissions, no network requests, no analytics, no remote code.

## Prefer a script?

`scripts/sqlite_mosaic.py` reads the browser's local files directly and writes a PNG. Close the browser first so the database is not locked; the script copies it to a temp file to be safe.

```bash
pip install pillow
python3 scripts/sqlite_mosaic.py --browser brave --mode spiral --days 90
```

It includes `chrono`, `spiral`, and `bubbles`. The extension has all 14.

## License

MIT. See [LICENSE](LICENSE).
