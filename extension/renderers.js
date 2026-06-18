/* Favicon Collage — pure canvas renderers.
 * Each renderer: fn(canvas, tiles, opt) -> sets canvas size and draws.
 * A "tile" is { domain, time (ms), count, img (HTMLImageElement|null),
 *               color ([r,g,b]|null) }.
 * Renderers fall back to a solid `color` (or a neutral tile) when `img`
 * isn't available, so they can be unit-tested with colour-only tiles.
 */
(function (root) {
  const BG = "#0f0e0c";
  const MISS = "#2a2722";

  function ctxOf(canvas, w, h) {
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function paint(ctx, t, x, y, s) {
    if (t.img && t.img.complete && t.img.naturalWidth > 0) {
      ctx.drawImage(t.img, x, y, s, s);
    } else {
      ctx.fillStyle = t.color
        ? `rgb(${t.color[0]},${t.color[1]},${t.color[2]})` : MISS;
      ctx.fillRect(x, y, s, s);
    }
  }

  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return [h, mx ? d / mx : 0, mx];
  }

  const hsvOf = (t) => rgb2hsv(...(t.color || [42, 39, 34]));

  function byDomain(tiles) {
    const m = new Map();
    for (const t of tiles) {
      const e = m.get(t.domain);
      if (e) e.count += t.count || 1;
      else m.set(t.domain, { domain: t.domain, count: t.count || 1,
                             img: t.img, color: t.color });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }

  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-`
         + `${String(d.getDate()).padStart(2, "0")}`;
  }

  function byDay(tiles) {
    const days = new Map();
    for (const t of tiles) {
      const k = dayKey(t.time);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(t);
    }
    return days;
  }

  function dominantPerDay(tiles) {
    const out = [];
    for (const [k, items] of byDay(tiles)) {
      const c = new Map();
      for (const t of items) {
        const e = c.get(t.domain) || { n: 0, t };
        e.n += t.count || 1; c.set(t.domain, e);
      }
      let best = null;
      for (const e of c.values()) if (!best || e.n > best.n) best = e;
      out.push({ key: k, tile: best.t });
    }
    out.sort((a, b) => a.key < b.key ? -1 : 1);
    return out;
  }

  // ---------------------------------------------------------------- grids ---
  function gridDraw(canvas, tiles, tile, gap) {
    const cell = tile + gap, n = tiles.length;
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const ctx = ctxOf(canvas, cols * cell + gap, rows * cell + gap);
    tiles.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      paint(ctx, t, gap + c * cell, gap + r * cell, tile);
    });
  }

  function colourSorted(tiles, keyFn) {
    return tiles
      .map((t) => ({ t, k: keyFn(...hsvOf(t)) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
      .map((o) => o.t);
  }

  function phyllotaxis(canvas, tiles, tile) {
    const n = tiles.length, golden = Math.PI * (3 - Math.sqrt(5));
    const scale = tile * 0.95, maxr = scale * Math.sqrt(n) + tile;
    const S = 2 * maxr, ctx = ctxOf(canvas, S, S), cx = S / 2, cy = S / 2;
    tiles.forEach((t, i) => {
      const a = i * golden, r = scale * Math.sqrt(i + 0.5);
      paint(ctx, t, cx + r * Math.cos(a) - tile / 2,
            cy + r * Math.sin(a) - tile / 2, tile);
    });
  }

  // ------------------------------------------------------------ hilbert -----
  function hilbertD2XY(n, d) {
    let x = 0, y = 0, t = d;
    for (let s = 1; s < n; s *= 2) {
      const rx = 1 & (t / 2), ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
        [x, y] = [y, x];
      }
      x += s * rx; y += s * ry; t = Math.floor(t / 4);
    }
    return [x, y];
  }

  // ============================================================== MODES =====
  const R = {};

  R.chrono = (cv, tiles) => gridDraw(cv, tiles, 20, 1);

  R["by-site"] = (cv, tiles) =>
    gridDraw(cv, [...tiles].sort((a, b) =>
      a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0), 24, 2);

  R.spectrum = (cv, tiles) =>
    gridDraw(cv, colourSorted(tiles,
      (h, s, v) => (s < 0.12 ? 99 : Math.floor(h * 24)) + v / 1000), 18, 1);

  R.luminance = (cv, tiles) =>
    gridDraw(cv, colourSorted(tiles, (h, s, v) => v), 18, 1);

  R.spiral = (cv, tiles) => phyllotaxis(cv, tiles, 18);

  R["hue-spiral"] = (cv, tiles) =>
    phyllotaxis(cv, colourSorted(tiles, (h, s, v) => (s < 0.12 ? 2 : h)), 18);

  R.unique = (cv, tiles) => {
    const doms = byDomain(tiles), mx = doms[0] ? doms[0].count : 1, gap = 4, W = 1400;
    let x = gap, y = gap, rowh = 0;
    const placed = [];
    for (const d of doms) {
      const s = Math.max(18, Math.min(84,
        Math.round(18 + 66 * Math.sqrt(d.count / mx))));
      if (x + s + gap > W) { x = gap; y += rowh + gap; rowh = 0; }
      placed.push([d, s, x, y]); x += s + gap; rowh = Math.max(rowh, s);
    }
    const ctx = ctxOf(cv, W, y + rowh + gap);
    for (const [d, s, px, py] of placed) paint(ctx, d, px, py, s);
  };

  R.bubbles = (cv, tiles) => {
    const doms = byDomain(tiles), mx = doms[0] ? doms[0].count : 1;
    const golden = Math.PI * (3 - Math.sqrt(5)), placed = [];
    for (const d of doms) {
      const r = Math.max(8, Math.round(11 + 80 * Math.sqrt(d.count / mx)));
      let k = 0;
      for (;;) {
        const rad = 2.2 * Math.sqrt(k), ang = k * golden;
        const cx = rad * Math.cos(ang), cy = rad * Math.sin(ang);
        if (placed.every(p =>
          (cx - p.cx) ** 2 + (cy - p.cy) ** 2 >= (r + p.r + 2) ** 2)) {
          placed.push({ cx, cy, r, d }); break;
        }
        k++;
      }
    }
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of placed) {
      minx = Math.min(minx, p.cx - p.r); miny = Math.min(miny, p.cy - p.r);
      maxx = Math.max(maxx, p.cx + p.r); maxy = Math.max(maxy, p.cy + p.r);
    }
    const pad = 18;
    const ctx = ctxOf(cv, maxx - minx + 2 * pad, maxy - miny + 2 * pad);
    for (const p of placed) {
      const cx = p.cx - minx + pad, cy = p.cy - miny + pad;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, p.r, 0, 2 * Math.PI); ctx.clip();
      paint(ctx, p.d, cx - p.r, cy - p.r, 2 * p.r);
      ctx.restore();
    }
  };

  R.treemap = (cv, tiles) => {
    const doms = byDomain(tiles), W = 1600, H = 1100, rects = [];
    (function sq(items, x, y, w, h) {
      if (!items.length) return;
      if (items.length === 1) { rects.push([x, y, w, h, items[0]]); return; }
      const total = items.reduce((s, d) => s + d.count, 0), half = total / 2;
      let acc = 0, i = 0;
      while (i < items.length - 1 && acc + items[i].count < half) acc += items[i++].count;
      const a = items.slice(0, i + 1), b = items.slice(i + 1);
      const sa = a.reduce((s, d) => s + d.count, 0);
      if (w >= h) { const wa = w * sa / total; sq(a, x, y, wa, h); sq(b, x + wa, y, w - wa, h); }
      else { const ha = h * sa / total; sq(a, x, y, w, ha); sq(b, x, y + ha, w, h - ha); }
    })(doms, 0, 0, W, H);
    const ctx = ctxOf(cv, W, H);
    for (const [x, y, w, h, d] of rects) {
      if (w < 2 || h < 2) continue;
      let ts = Math.max(8, Math.min(w, h)); if (ts > 40) ts = 16;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      for (let ty = y; ty < y + h; ty += ts)
        for (let tx = x; tx < x + w; tx += ts) paint(ctx, d, tx, ty, ts);
      ctx.restore();
      ctx.strokeStyle = BG; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  };

  R.hilbert = (cv, tiles) => {
    const tile = 20; let p = 1;
    while ((1 << p) * (1 << p) <= tiles.length) p++;
    p = Math.max(1, p - 1);
    const side = 1 << p, sub = tiles.slice(0, side * side);
    const ctx = ctxOf(cv, side * tile, side * tile);
    sub.forEach((t, i) => {
      const [x, y] = hilbertD2XY(side, i);
      paint(ctx, t, x * tile, y * tile, tile);
    });
  };

  R["year-strip"] = (cv, tiles) => {
    const seq = dominantPerDay(tiles), tile = 48, gap = 4, cols = 12;
    const cell = tile + gap, rows = Math.ceil(seq.length / cols);
    const ctx = ctxOf(cv, cols * cell + gap, rows * cell + gap);
    seq.forEach((s, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      paint(ctx, s.tile, gap + c * cell, gap + r * cell, tile);
    });
  };

  R["day-rows"] = (cv, tiles) => {
    const days = [...byDay(tiles).entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
    const tile = 14, gap = 1, cell = tile + gap, margin = 96;
    const maxlen = Math.max(1, ...days.map(([, v]) => v.length));
    const ctx = ctxOf(cv, margin + maxlen * cell + gap, days.length * cell + gap);
    ctx.font = "10px monospace"; ctx.textBaseline = "middle";
    days.forEach(([k, items], r) => {
      const y = gap + r * cell;
      ctx.fillStyle = "#8a8170";
      ctx.fillText(k.slice(5), 8, y + tile / 2);
      items.forEach((t, c) => paint(ctx, t, margin + c * cell, y, tile));
    });
  };

  R.clock = (cv, tiles) => {
    const pts = [...tiles].filter(t => t.time);
    const dkeys = [...new Set(pts.map(t => dayKey(t.time)))].sort();
    const didx = new Map(dkeys.map((k, i) => [k, i]));
    const tile = 14, inner = tile * 3, ring = tile * 1.4;
    const S = 2 * (inner + ring * dkeys.length + tile), ctx = ctxOf(cv, S, S);
    const cx = S / 2, cy = S / 2;
    for (const t of pts) {
      const d = new Date(t.time);
      const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      const a = (secs / 86400) * 2 * Math.PI - Math.PI / 2;
      const r = inner + ring * didx.get(dayKey(t.time));
      paint(ctx, t, cx + r * Math.cos(a) - tile / 2, cy + r * Math.sin(a) - tile / 2, tile);
    }
  };

  R.calendar = (cv, tiles) => {
    const dom = new Map(dominantPerDay(tiles).map(s => [s.key, s.tile]));
    const keys = [...dom.keys()].sort();
    if (!keys.length) { ctxOf(cv, 200, 60); return; }
    const toOrd = (k) => { const [y, m, d] = k.split("-").map(Number);
      return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
    const wd = (k) => { const [y, m, d] = k.split("-").map(Number);
      return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }; // Mon=0
    const o0 = toOrd(keys[0]), o1 = toOrd(keys[keys.length - 1]);
    const week0 = o0 - wd(keys[0]);
    const cell = 26, pad = 3, top = 22, left = 8;
    const weeks = Math.floor((o1 - week0) / 7) + 1;
    const ctx = ctxOf(cv, left + weeks * (cell + pad) + pad, top + 7 * (cell + pad) + pad);
    for (let o = o0; o <= o1; o++) {
      const k = new Date(o * 86400000).toISOString().slice(0, 10);
      const wk = Math.floor((o - week0) / 7);
      const x = left + wk * (cell + pad) + pad;
      const y = top + ((new Date(o * 86400000).getUTCDay() + 6) % 7) * (cell + pad) + pad;
      const t = dom.get(k);
      if (t) paint(ctx, t, x, y, cell);
      else { ctx.fillStyle = "#1a1815"; ctx.fillRect(x, y, cell, cell); }
    }
  };

  root.FaviconRenderers = R;
  root.FaviconRenderers.MODES = [
    "chrono", "by-site", "spiral", "hue-spiral", "spectrum", "luminance",
    "bubbles", "treemap", "hilbert", "calendar", "year-strip", "day-rows", "clock", "unique",
  ];
})(typeof window !== "undefined" ? window : globalThis);
