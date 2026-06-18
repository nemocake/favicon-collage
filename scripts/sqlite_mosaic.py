#!/usr/bin/env python3
"""
sqlite_mosaic.py — the original method, as a portable reference
===============================================================
Builds a favicon collage straight from a Chromium browser's local SQLite
files (History + Favicons). This is what the project started as, before the
browser extension. It works with Chrome / Brave / Edge / Vivaldi / Arc on
macOS, Linux and Windows. Nothing leaves your machine.

  python3 sqlite_mosaic.py --browser brave --mode spiral --days 90
  python3 sqlite_mosaic.py --profile "/path/to/Default"    # explicit profile

Requires Pillow:  pip install pillow

Modes: chrono | spiral | bubbles   (the extension has 14 — see extension/)
"""
import argparse, io, math, os, platform, shutil, sqlite3, sys, tempfile
from collections import Counter
from PIL import Image, ImageDraw

BG = (15, 14, 12)
MISS = (40, 37, 32)


def profile_dirs(browser):
    home = os.path.expanduser("~")
    sysname = platform.system()
    roots = {
        "Darwin": {
            "chrome": "Library/Application Support/Google/Chrome",
            "brave": "Library/Application Support/BraveSoftware/Brave-Browser",
            "edge": "Library/Application Support/Microsoft Edge",
            "vivaldi": "Library/Application Support/Vivaldi",
            "arc": "Library/Application Support/Arc/User Data",
        },
        "Linux": {
            "chrome": ".config/google-chrome",
            "brave": ".config/BraveSoftware/Brave-Browser",
            "edge": ".config/microsoft-edge",
            "vivaldi": ".config/vivaldi",
        },
        "Windows": {
            "chrome": "AppData/Local/Google/Chrome/User Data",
            "brave": "AppData/Local/BraveSoftware/Brave-Browser/User Data",
            "edge": "AppData/Local/Microsoft/Edge/User Data",
            "vivaldi": "AppData/Local/Vivaldi/User Data",
        },
    }
    base = os.path.join(home, roots.get(sysname, {}).get(browser, ""))
    return os.path.join(base, "Default")


def domain_of(url):
    if "://" not in url:
        return url
    return url.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0]


def copy_db(path):
    tmp = os.path.join(tempfile.gettempdir(), "fc_" + os.path.basename(path))
    shutil.copy2(path, tmp)
    return tmp


def load(profile, days):
    hist = copy_db(os.path.join(profile, "History"))
    con = sqlite3.connect(hist)
    cutoff = ""
    if days:
        micros = (days * 86400) * 1_000_000
        cutoff = (f"WHERE last_visit_time > "
                  f"(strftime('%s','now')+11644473600)*1000000 - {micros}")
    rows = con.execute(
        f"SELECT url, last_visit_time, visit_count FROM urls {cutoff} "
        f"ORDER BY last_visit_time ASC").fetchall()
    con.close()

    fav = copy_db(os.path.join(profile, "Favicons"))
    fcon = sqlite3.connect(fav)
    icons = {}
    for purl, blob in fcon.execute(
        "SELECT m.page_url, b.image_data FROM icon_mapping m "
        "JOIN favicon_bitmaps b ON b.icon_id=m.icon_id "
        "WHERE b.image_data IS NOT NULL ORDER BY b.width ASC"):
        try:
            icons[domain_of(purl)] = Image.open(io.BytesIO(blob)).convert("RGBA")
        except Exception:
            pass
    fcon.close()

    tiles = []
    for url, _t, cnt in rows:
        if not url.startswith("http"):
            continue
        d = domain_of(url)
        tiles.append((d, cnt or 1))
    return tiles, icons


def tile_img(icons, dom, size):
    img = icons.get(dom)
    if img is None:
        return Image.new("RGBA", (size, size), (*MISS, 255))
    return img.resize((size, size), Image.LANCZOS) if img.size != (size, size) else img


def render(tiles, icons, mode, out):
    doms = [d for d, _ in tiles]
    if mode == "chrono":
        t, g = 20, 1
        cell = t + g
        n = len(doms)
        cols = math.ceil(math.sqrt(n))
        rows = math.ceil(n / cols)
        cv = Image.new("RGBA", (cols * cell + g, rows * cell + g), (*BG, 255))
        for i, d in enumerate(doms):
            r, c = divmod(i, cols)
            cv.alpha_composite(tile_img(icons, d, t), (g + c * cell, g + r * cell))
    elif mode == "spiral":
        t = 18
        n = len(doms)
        golden = math.pi * (3 - math.sqrt(5))
        scale = t * 0.95
        S = int(2 * (scale * math.sqrt(n) + t))
        cv = Image.new("RGBA", (S, S), (*BG, 255))
        for i, d in enumerate(doms):
            a, r = i * golden, scale * math.sqrt(i + 0.5)
            cv.alpha_composite(tile_img(icons, d, t),
                               (int(S / 2 + r * math.cos(a) - t / 2),
                                int(S / 2 + r * math.sin(a) - t / 2)))
    elif mode == "bubbles":
        counts = Counter(doms)
        items = counts.most_common()
        mx = items[0][1]
        golden = math.pi * (3 - math.sqrt(5))
        placed = []
        for dom, c in items:
            r = max(8, int(11 + 80 * math.sqrt(c / mx)))
            k = 0
            while True:
                rad, ang = 2.2 * math.sqrt(k), k * golden
                cx, cy = rad * math.cos(ang), rad * math.sin(ang)
                if all((cx - px) ** 2 + (cy - py) ** 2 >= (r + pr + 2) ** 2
                       for px, py, pr, _ in placed):
                    placed.append((cx, cy, r, dom)); break
                k += 1
        minx = min(cx - r for cx, _, r, _ in placed)
        miny = min(cy - r for _, cy, r, _ in placed)
        maxx = max(cx + r for cx, _, r, _ in placed)
        maxy = max(cy + r for _, cy, r, _ in placed)
        pad = 18
        cv = Image.new("RGBA", (int(maxx - minx) + 2 * pad, int(maxy - miny) + 2 * pad), (*BG, 255))
        for cx, cy, r, dom in placed:
            ic = tile_img(icons, dom, 2 * r)
            mask = Image.new("L", (2 * r, 2 * r), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
            cv.paste(ic, (int(cx - minx - r + pad), int(cy - miny - r + pad)), mask)
    else:
        sys.exit(f"unknown mode: {mode}")
    cv.convert("RGB").save(out)
    return cv.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--browser", default="brave",
                    choices=["chrome", "brave", "edge", "vivaldi", "arc"])
    ap.add_argument("--profile", help="explicit path to the profile dir (overrides --browser)")
    ap.add_argument("--mode", default="chrono", choices=["chrono", "spiral", "bubbles"])
    ap.add_argument("--days", type=int, default=90, help="0 = all history")
    ap.add_argument("--out", default="favicon-collage.png")
    args = ap.parse_args()

    profile = args.profile or profile_dirs(args.browser)
    if not os.path.exists(os.path.join(profile, "History")):
        sys.exit(f"No History db at {profile!r}. Close the browser or pass --profile.")
    tiles, icons = load(profile, args.days)
    if not tiles:
        sys.exit("No history matched.")
    w, h = render(tiles, icons, args.mode, args.out)
    print(f"{len(tiles)} tiles · {len(set(d for d,_ in tiles))} sites "
          f"· {w}x{h} -> {args.out}")


if __name__ == "__main__":
    main()
