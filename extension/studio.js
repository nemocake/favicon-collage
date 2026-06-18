/* Favicon Collage — studio glue (runs as an extension page). */
(function () {
  const R = window.FaviconRenderers, F = window.FaviconFilter;
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), statusEl = $("status"), empty = $("empty");
  const hasExt = typeof chrome !== "undefined" && chrome.runtime;

  const LABELS = {
    "chrono": "Chronological grid", "by-site": "Grouped by site",
    "spiral": "Spiral (phyllotaxis)", "hue-spiral": "Rainbow spiral",
    "spectrum": "Colour spectrum", "luminance": "Light → dark",
    "bubbles": "Bubble pack", "treemap": "Treemap", "hilbert": "Hilbert curve",
    "calendar": "Year calendar", "year-strip": "One icon per day",
    "day-rows": "One row per day", "clock": "Time-of-day clock",
    "unique": "Unique sites",
  };

  R.MODES.forEach((m) => {
    const o = document.createElement("option");
    o.value = m; o.textContent = LABELS[m] || m;
    $("mode").appendChild(o);
  });

  let allTiles = [];      // full dataset (favicons + colours loaded)
  let domains = [];       // [{domain, count, url, color}] sorted desc
  let excluded = new Set();
  let lastMode = "chrono";

  // -------- persistence ------------------------------------------------------
  function saveExcluded() {
    if (hasExt && chrome.storage) chrome.storage.local.set({ excluded: [...excluded] });
  }
  async function loadExcluded() {
    if (hasExt && chrome.storage) {
      const r = await chrome.storage.local.get("excluded");
      if (Array.isArray(r.excluded)) excluded = new Set(r.excluded);
    }
  }

  // -------- helpers ----------------------------------------------------------
  function setStatus(html, pct) {
    statusEl.innerHTML = html
      + (pct != null ? ` <span class="bar" style="width:${pct * 240}px"></span>` : "");
  }
  function faviconURL(pageUrl, size) {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl);
    u.searchParams.set("size", String(size));
    return u.toString();
  }
  const visible = () => allTiles.filter((t) => !excluded.has(t.domain));
  const selectedCount = () => domains.filter((d) => !excluded.has(d.domain)).length;

  // -------- history + favicons ----------------------------------------------
  async function gatherHistory() {
    const days = parseInt($("timeframe").value, 10);
    const startTime = days ? Date.now() - days * 86400000 : 0;
    setStatus("Reading history…");
    const items = await chrome.history.search({ text: "", startTime, maxResults: 1000000 });
    let rows = items
      .filter((it) => it.url && it.lastVisitTime && it.url.startsWith("http"))
      .map((it) => ({
        url: it.url, domain: F.domainOf(it.url),
        time: it.lastVisitTime, count: it.visitCount || 1, img: null, color: null,
      }))
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
      setStatus(`Loading favicons… ${Math.min(i + batch, rows.length)} / ${rows.length}`,
        (i + batch) / rows.length);
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
  }

  // -------- domain sidebar ---------------------------------------------------
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
    s.className = "swatch"; s.style.cssText =
      `width:16px;height:16px;border-radius:3px;flex:0 0 auto;display:inline-block;`
      + `background:rgb(${(d.color || [60, 56, 50]).join(",")})`;
    return s;
  }

  function renderRows() {
    const q = $("site-search").value.trim().toLowerCase();
    const list = $("site-list"); list.textContent = "";
    const frag = document.createDocumentFragment();
    for (const d of domains) {
      if (q && !d.domain.includes(q)) continue;
      const off = excluded.has(d.domain);
      const row = document.createElement("label");
      row.className = "site-row" + (off ? " off" : "");
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
    $("sites-count").textContent = `Sites · ${selectedCount()}/${domains.length}`;
  }

  function toggle(domain, on) {
    if (on) excluded.delete(domain); else excluded.add(domain);
    saveExcluded();
    $("sites-count").textContent = `Sites · ${selectedCount()}/${domains.length}`;
    [...$("site-list").children].forEach((r) => {
      if (r.querySelector(".nm").textContent === domain.replace(/^www\./, ""))
        r.classList.toggle("off", excluded.has(domain));
    });
    redraw();
  }

  function bulk(kind) {
    if (kind === "all") excluded.clear();
    else if (kind === "none") domains.forEach((d) => excluded.add(d.domain));
    else if (kind === "nonart")
      domains.forEach((d) => { if (F.hide.nonart(d.domain)) excluded.add(d.domain); });
    else if (kind === "invert")
      domains.forEach((d) => excluded.has(d.domain) ? excluded.delete(d.domain) : excluded.add(d.domain));
    saveExcluded(); renderRows(); redraw();
  }

  // -------- draw -------------------------------------------------------------
  function draw(mode) {
    const tiles = visible();
    lastMode = mode;
    if (!tiles.length) {
      canvas.style.display = "none"; empty.style.display = "block";
      empty.innerHTML = "<h2>Nothing selected</h2><p>Re-check some sites in the left panel.</p>";
      $("save").disabled = true;
      setStatus("0 tiles selected.");
      return;
    }
    (R[mode] || R.chrono)(canvas, tiles);
    empty.style.display = "none"; canvas.style.display = "block";
    $("save").disabled = false;
    setStatus(`${tiles.length} tiles · ${selectedCount()} sites · `
      + `${LABELS[mode] || mode} · ${canvas.width}×${canvas.height}px`);
  }
  function redraw() { if (allTiles.length) draw($("mode").value); }

  function onData(tiles, note) {
    allTiles = tiles;
    domains = aggregate(tiles);
    $("sidebar").hidden = false; $("side-reopen").hidden = true;
    renderRows();
    draw($("mode").value);
    if (note) setStatus(note + ` · ${visible().length} tiles · ${LABELS[$("mode").value]}`);
  }

  // -------- events -----------------------------------------------------------
  $("generate").addEventListener("click", async () => {
    if (!hasExt || !chrome.history) {
      setStatus("Open this page from the extension's toolbar icon (needs history access).");
      return;
    }
    $("generate").disabled = true; $("save").disabled = true;
    try {
      const rows = await gatherHistory();
      await loadFavicons(rows);
      onData(rows);
    } catch (e) { setStatus("Error: " + e.message); }
    finally { $("generate").disabled = false; }
  });

  $("mode").addEventListener("change", redraw);
  $("site-search").addEventListener("input", renderRows);
  document.querySelectorAll(".bulk button").forEach((b) =>
    b.addEventListener("click", () => bulk(b.dataset.bulk)));
  $("side-collapse").addEventListener("click", () => {
    $("sidebar").hidden = true; $("side-reopen").hidden = false;
  });
  $("side-reopen").addEventListener("click", () => {
    $("sidebar").hidden = false; $("side-reopen").hidden = true;
  });

  $("demo").addEventListener("click", () => {
    const DOMS = ["are.na", "tate.org.uk", "moma.org", "archive.org", "getty.edu",
      "artic.edu", "walkerart.org", "vam.ac.uk", "webumenia.sk", "jstor.org",
      "x.com", "youtube.com", "mybank.com", "wikipedia.org", "rijksmuseum.nl"];
    const PAL = [[217,96,59],[236,230,218],[70,90,160],[60,160,140],[200,60,70],
      [240,200,60],[150,142,126],[255,255,255],[90,140,200],[180,90,160]];
    const rnd = (n) => Math.floor((Math.sin(n * 999.7) * 0.5 + 0.5) * 1e6);
    const tiles = Array.from({ length: 800 }, (_, i) => {
      const dom = DOMS[rnd(i) % DOMS.length];
      return { domain: dom, url: "https://" + dom,
        time: Date.now() - (800 - i) * 3 * 3600 * 1000,
        count: 1 + rnd(i + 7) % 30, img: null, color: PAL[rnd(i + 3) % PAL.length] };
    });
    onData(tiles, "Demo data — uncheck sites at left, change the collage dropdown");
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
})();
