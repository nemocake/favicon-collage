/* Favicon Collage — studio glue (runs as an extension page). */
(function () {
  const R = window.FaviconRenderers;
  const $ = (id) => document.getElementById(id);
  const domainOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
  const canvas = $("canvas"), empty = $("empty");
  const hasExt = typeof chrome !== "undefined" && chrome.runtime;

  const LABELS = {
    "chrono": "Chronological grid", "by-site": "Grouped by site",
    "spiral": "Spiral", "hue-spiral": "Rainbow spiral",
    "spectrum": "Colour spectrum", "luminance": "Light to dark",
    "bubbles": "Bubble pack", "treemap": "Treemap", "hilbert": "Hilbert curve",
    "calendar": "Year calendar", "year-strip": "One icon per day",
    "day-rows": "One row per day", "clock": "Time of day clock",
    "unique": "Unique sites",
  };

  R.MODES.forEach((m) => {
    const o = document.createElement("option");
    o.value = m; o.textContent = LABELS[m] || m;
    $("mode").appendChild(o);
  });

  let allTiles = [], domains = [], excluded = new Set(), lastMode = "chrono";

  // ---- zoom & pan viewport --------------------------------------------------
  const vp = $("viewport"), frameEl = $("frame");
  let z = 1, fitZ = 1, panX = 0, panY = 0, dragging = false, dStart = null;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function applyView() {
    frameEl.style.transform = `translate(${panX}px,${panY}px) scale(${z})`;
    $("zpct").textContent = Math.round(z * 100) + "%";
    $("zoom").value = String(z);
  }
  function fitView() {
    const fw = frameEl.offsetWidth, fh = frameEl.offsetHeight;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    if (!fw || !fh || !vw || !vh) return;
    fitZ = clampN(Math.min(vw / fw, vh / fh), 0.05, 4);
    z = fitZ; panX = (vw - fw * z) / 2; panY = (vh - fh * z) / 2;
    applyView();
  }
  function centerAt(scale) {
    const fw = frameEl.offsetWidth, fh = frameEl.offsetHeight;
    z = scale; panX = (vp.clientWidth - fw * z) / 2; panY = (vp.clientHeight - fh * z) / 2;
    applyView();
  }
  function zoomAround(px, py, nz) {
    nz = clampN(nz, 0.05, 8);
    const cx = (px - panX) / z, cy = (py - panY) / z;
    z = nz; panX = px - cx * z; panY = py - cy * z; applyView();
  }
  vp.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAround(e.clientX - r.left, e.clientY - r.top, z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  vp.addEventListener("mousedown", (e) => {
    if (e.target.closest(".zoombar")) return;
    dragging = true; vp.classList.add("dragging");
    dStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panX = dStart.px + (e.clientX - dStart.x);
    panY = dStart.py + (e.clientY - dStart.y); applyView();
  });
  window.addEventListener("mouseup", () => { dragging = false; vp.classList.remove("dragging"); });
  vp.addEventListener("dblclick", () => {
    if (Math.abs(z - fitZ) < 0.01) zoomAround(vp.clientWidth / 2, vp.clientHeight / 2, 1);
    else fitView();
  });
  $("zoom").addEventListener("input", () =>
    zoomAround(vp.clientWidth / 2, vp.clientHeight / 2, parseFloat($("zoom").value)));
  $("zfit").addEventListener("click", fitView);
  window.addEventListener("resize", () => { if (allTiles.length) fitView(); else centerAt(1); });

  function saveExcluded() {
    if (hasExt && chrome.storage) chrome.storage.local.set({ excluded: [...excluded] });
  }
  async function loadExcluded() {
    if (hasExt && chrome.storage) {
      const r = await chrome.storage.local.get("excluded");
      if (Array.isArray(r.excluded)) excluded = new Set(r.excluded);
    }
  }

  function setStatus(msg, pct) {
    const bar = $("progress-bar");
    if (pct != null) { bar.style.opacity = "1"; bar.style.width = (pct * 100) + "%"; }
    else { bar.style.width = "0"; bar.style.opacity = "0"; }
    $("status").textContent = msg || "";
  }
  function faviconURL(pageUrl, size) {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl); u.searchParams.set("size", String(size));
    return u.toString();
  }
  const visible = () => allTiles.filter((t) => !excluded.has(t.domain));
  const selectedCount = () => domains.filter((d) => !excluded.has(d.domain)).length;
  const tfLabel = () => { const s = $("timeframe"); return s.options[s.selectedIndex].textContent; };

  // ---- history + favicons ---------------------------------------------------
  async function gatherHistory() {
    const days = parseInt($("timeframe").value, 10);
    const startTime = days ? Date.now() - days * 86400000 : 0;
    setStatus("reading history…", 0.02);
    const items = await chrome.history.search({ text: "", startTime, maxResults: 1000000 });
    let rows = items
      .filter((it) => it.url && it.lastVisitTime && it.url.startsWith("http"))
      .map((it) => ({ url: it.url, domain: domainOf(it.url),
        time: it.lastVisitTime, count: it.visitCount || 1, img: null, color: null }))
      .filter((t) => t.domain)
      .sort((a, b) => a.time - b.time);
    const max = parseInt($("maxtiles").value, 10);
    if (rows.length > max) {
      const step = rows.length / max, out = [];
      for (let i = 0; i < rows.length; i += step) out.push(rows[Math.floor(i)]);
      rows = out;
    }
    return rows;
  }
  function loadOne(t, size) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { t.img = img; res(); };
      img.onerror = () => res();
      img.src = faviconURL(t.url, size);
    });
  }
  async function loadFavicons(rows) {
    const size = 32, batch = 64;
    for (let i = 0; i < rows.length; i += batch) {
      await Promise.all(rows.slice(i, i + batch).map((t) => loadOne(t, size)));
      setStatus("gathering favicons…", (i + batch) / rows.length);
    }
    const oc = document.createElement("canvas"); oc.width = oc.height = 1;
    const octx = oc.getContext("2d", { willReadFrequently: true });
    for (const t of rows) {
      if (!t.img) continue;
      try {
        octx.clearRect(0, 0, 1, 1); octx.drawImage(t.img, 0, 0, 1, 1);
        const [r, g, b] = octx.getImageData(0, 0, 1, 1).data; t.color = [r, g, b];
      } catch { /* tainted */ }
    }
    setStatus("");
  }

  // ---- index sidebar --------------------------------------------------------
  function aggregate(tiles) {
    const m = new Map();
    for (const t of tiles) {
      let e = m.get(t.domain);
      if (!e) { e = { domain: t.domain, count: 0, url: t.url, color: t.color }; m.set(t.domain, e); }
      e.count += t.count || 1;
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }
  function sideIcon(d) {
    if (hasExt) {
      const img = document.createElement("img");
      img.src = faviconURL(d.url, 16); img.loading = "lazy";
      img.onerror = () => { img.style.visibility = "hidden"; };
      return img;
    }
    const s = document.createElement("span");
    s.style.cssText = "width:15px;height:15px;border-radius:3px;flex:0 0 auto;"
      + `display:inline-block;background:rgb(${(d.color || [60, 56, 50]).join(",")})`;
    return s;
  }
  function updateCount() { $("sites-count").textContent = `Index · ${selectedCount()}/${domains.length}`; }

  function renderRows() {
    const q = $("site-search").value.trim().toLowerCase();
    const list = $("site-list"); list.textContent = "";
    const frag = document.createDocumentFragment();
    for (const d of domains) {
      if (q && !d.domain.includes(q)) continue;
      const off = excluded.has(d.domain);
      const row = document.createElement("label");
      row.className = "site-row" + (off ? " off" : "");
      row.dataset.domain = d.domain;
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !off;
      cb.addEventListener("change", () => toggle(d.domain, cb.checked));
      const nm = document.createElement("span"); nm.className = "nm";
      nm.textContent = d.domain.replace(/^www\./, "");
      const ct = document.createElement("span"); ct.className = "ct"; ct.textContent = d.count;
      row.append(cb, sideIcon(d), nm, ct);
      frag.appendChild(row);
    }
    list.appendChild(frag);
    updateCount();
  }
  function toggle(domain, on) {
    if (on) excluded.delete(domain); else excluded.add(domain);
    saveExcluded(); updateCount();
    const row = $("site-list").querySelector(`[data-domain="${CSS.escape(domain)}"]`);
    if (row) row.classList.toggle("off", excluded.has(domain));
    redraw();
  }
  function bulk(kind) {
    if (kind === "all") excluded.clear();
    else if (kind === "none") domains.forEach((d) => excluded.add(d.domain));
    else if (kind === "invert") domains.forEach((d) => excluded.has(d.domain) ? excluded.delete(d.domain) : excluded.add(d.domain));
    saveExcluded(); renderRows(); redraw();
  }

  // ---- draw -----------------------------------------------------------------
  function showEmpty(title, body) {
    canvas.style.display = "none"; $("label").hidden = true;
    $("zoombar").hidden = true;
    empty.style.display = "block";
    empty.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
    $("save").disabled = true;
    requestAnimationFrame(() => centerAt(1));
  }
  function draw(mode) {
    const tiles = visible();
    lastMode = mode;
    if (!tiles.length) {
      showEmpty("Nothing selected", "Re-check a few sites in the index to the left.");
      return;
    }
    (R[mode] || R.chrono)(canvas, tiles);
    empty.style.display = "none"; canvas.style.display = "block";
    canvas.classList.remove("show");
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add("show")));
    $("save").disabled = false;
    $("cap-title").textContent = LABELS[mode] || mode;
    const render = R.getColorMode() ? "colour study" : "favicons";
    $("cap-meta").textContent =
      `${render} · ${tiles.length} tiles · ${selectedCount()} sites · ${tfLabel()} · ${canvas.width}×${canvas.height}`;
    $("label").hidden = false;
    $("zoombar").hidden = false;
    requestAnimationFrame(fitView);
  }
  function redraw() { if (allTiles.length) draw($("mode").value); }

  function onData(tiles) {
    allTiles = tiles; domains = aggregate(tiles);
    $("sidebar").hidden = false; $("side-reopen").hidden = true;
    $("rendertoggle").hidden = false;
    renderRows(); draw($("mode").value);
  }

  // ---- events ---------------------------------------------------------------
  $("generate").addEventListener("click", async () => {
    if (!hasExt || !chrome.history) {
      setStatus("open from the toolbar icon"); return;
    }
    $("generate").disabled = true; $("save").disabled = true;
    try { const rows = await gatherHistory(); await loadFavicons(rows); onData(rows); }
    catch (e) { setStatus("error: " + e.message); }
    finally { $("generate").disabled = false; }
  });
  $("mode").addEventListener("change", redraw);
  document.querySelectorAll(".rendertoggle button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".rendertoggle button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      R.setColorMode(b.dataset.render === "col");
      redraw();
    }));
  $("site-search").addEventListener("input", renderRows);
  document.querySelectorAll(".bulk button").forEach((b) =>
    b.addEventListener("click", () => bulk(b.dataset.bulk)));
  $("side-collapse").addEventListener("click", () => {
    $("sidebar").hidden = true; $("side-reopen").hidden = false;
  });
  $("side-reopen").addEventListener("click", () => {
    $("sidebar").hidden = false; $("side-reopen").hidden = true;
  });

  $("demo").addEventListener("click", async () => {
    const DOMS = ["wikipedia.org", "youtube.com", "github.com", "nytimes.com",
      "reddit.com", "archive.org", "tate.org.uk", "moma.org", "getty.edu",
      "x.com", "google.com", "spotify.com", "mybank.com", "arxiv.org", "figma.com"];
    const PAL = [[217,96,59],[236,230,218],[70,90,160],[60,160,140],[200,60,70],
      [240,200,60],[150,142,126],[255,255,255],[90,140,200],[180,90,160]];
    const rnd = (n) => Math.floor((Math.sin(n * 999.7) * 0.5 + 0.5) * 1e6);
    // generate a little lettered favicon-chip per domain (offline, no network)
    const glyphs = await Promise.all(DOMS.map((dom, i) => new Promise((res) => {
      const c = document.createElement("canvas"); c.width = c.height = 32;
      const g = c.getContext("2d"), col = PAL[rnd(i + 3) % PAL.length];
      g.fillStyle = `rgb(${col.join(",")})`; g.fillRect(0, 0, 32, 32);
      const lum = .299 * col[0] + .587 * col[1] + .114 * col[2];
      g.fillStyle = lum > 140 ? "#161310" : "#f2ecdf";
      g.font = "600 20px ui-monospace, monospace";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(dom[0].toUpperCase(), 16, 17);
      const img = new Image(); img.onload = () => res({ dom, img, col }); img.src = c.toDataURL();
    })));
    const gmap = new Map(glyphs.map((o) => [o.dom, o]));
    const tiles = Array.from({ length: 800 }, (_, i) => {
      const dom = DOMS[rnd(i) % DOMS.length], o = gmap.get(dom);
      return { domain: dom, url: "https://" + dom,
        time: Date.now() - (800 - i) * 3 * 3600 * 1000,
        count: 1 + rnd(i + 7) % 30, img: o.img, color: o.col };
    });
    onData(tiles);
    setStatus("demo");
  });

  $("save").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `favicon-collage-${lastMode}.png`;
      a.click(); URL.revokeObjectURL(a.href);
    });
  });

  loadExcluded();
  requestAnimationFrame(() => centerAt(1));
})();
