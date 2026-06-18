/* Favicon Collage — studio glue (runs as an extension page). */
(function () {
  const R = window.FaviconRenderers, F = window.FaviconFilter;
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), statusEl = $("status"), empty = $("empty");

  const LABELS = {
    "chrono": "Chronological grid", "by-site": "Grouped by site",
    "spiral": "Spiral (phyllotaxis)", "hue-spiral": "Rainbow spiral",
    "spectrum": "Colour spectrum", "luminance": "Light → dark",
    "bubbles": "Bubble pack", "treemap": "Treemap", "hilbert": "Hilbert curve",
    "calendar": "Year calendar", "year-strip": "One icon per day",
    "day-rows": "One row per day", "clock": "Time-of-day clock",
    "unique": "Unique sites",
  };

  // populate mode dropdown
  const modeSel = $("mode");
  R.MODES.forEach((m) => {
    const o = document.createElement("option");
    o.value = m; o.textContent = LABELS[m] || m;
    modeSel.appendChild(o);
  });

  let tiles = [];        // current dataset
  let lastMode = null;

  function setStatus(html, pct) {
    statusEl.innerHTML = html
      + (pct != null ? ` <span class="bar" style="width:${pct * 260}px"></span>` : "");
  }

  function faviconURL(pageUrl, size) {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl);
    u.searchParams.set("size", String(size));
    return u.toString();
  }

  // ---- gather real history --------------------------------------------------
  async function gatherHistory() {
    const days = parseInt($("timeframe").value, 10);
    const startTime = days ? Date.now() - days * 86400000 : 0;
    setStatus("Reading history…");
    const items = await chrome.history.search({
      text: "", startTime, maxResults: 1000000,
    });
    const keep = F.presets[$("filter").value];
    let rows = items
      .filter((it) => it.url && it.lastVisitTime)
      .map((it) => ({
        url: it.url, domain: F.domainOf(it.url),
        time: it.lastVisitTime, count: it.visitCount || 1,
        img: null, color: null,
      }))
      .filter((t) => t.domain && keep(t.domain))
      .sort((a, b) => a.time - b.time);

    const max = parseInt($("maxtiles").value, 10);
    if (rows.length > max) {
      const step = rows.length / max, out = [];
      for (let i = 0; i < rows.length; i += step) out.push(rows[Math.floor(i)]);
      rows = out;
    }
    return rows;
  }

  // ---- favicons + average colours ------------------------------------------
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
    // average colour for the colour-sorted modes
    const oc = document.createElement("canvas"); oc.width = oc.height = 1;
    const octx = oc.getContext("2d", { willReadFrequently: true });
    for (const t of rows) {
      if (!t.img) continue;
      try {
        octx.clearRect(0, 0, 1, 1);
        octx.drawImage(t.img, 0, 0, 1, 1);
        const [r, g, b] = octx.getImageData(0, 0, 1, 1).data;
        t.color = [r, g, b];
      } catch { /* tainted — leave null */ }
    }
  }

  function draw(mode) {
    if (!tiles.length) { setStatus("No history matched that filter / timeframe."); return; }
    const fn = R[mode] || R.chrono;
    fn(canvas, tiles);
    empty.style.display = "none";
    canvas.style.display = "block";
    $("save").disabled = false;
    lastMode = mode;
    setStatus(`${tiles.length} tiles · ${LABELS[mode] || mode} · `
      + `${canvas.width}×${canvas.height}px`);
  }

  // ---- buttons --------------------------------------------------------------
  $("generate").addEventListener("click", async () => {
    if (typeof chrome === "undefined" || !chrome.history) {
      setStatus("This page must run as the extension (open it from the toolbar icon).");
      return;
    }
    $("generate").disabled = true; $("save").disabled = true;
    try {
      tiles = await gatherHistory();
      await loadFavicons(tiles);
      draw($("mode").value);
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      $("generate").disabled = false;
    }
  });

  // re-render instantly when only the mode changes (no reload of favicons)
  modeSel.addEventListener("change", () => { if (tiles.length) draw(modeSel.value); });

  $("demo").addEventListener("click", () => {
    const DOMS = ["are.na", "tate.org.uk", "moma.org", "archive.org", "getty.edu",
      "artic.edu", "walkerart.org", "vam.ac.uk", "webumenia.sk", "jstor.org",
      "wikipedia.org", "rijksmuseum.nl", "centrepompidou.fr", "ubu.com"];
    const PAL = [[217,96,59],[236,230,218],[70,90,160],[60,160,140],[200,60,70],
      [240,200,60],[150,142,126],[255,255,255],[90,140,200],[180,90,160]];
    const rnd = (n) => Math.floor((Math.sin(n * 999.7) * 0.5 + 0.5) * 1e6);
    tiles = Array.from({ length: 800 }, (_, i) => ({
      domain: DOMS[rnd(i) % DOMS.length], url: "https://" + DOMS[rnd(i) % DOMS.length],
      time: Date.now() - (800 - i) * 3 * 3600 * 1000,
      count: 1 + rnd(i + 7) % 30, img: null,
      color: PAL[rnd(i + 3) % PAL.length],
    }));
    draw($("mode").value);
    setStatus(`Demo data · ${tiles.length} random tiles · `
      + `${LABELS[$("mode").value]} · change the collage dropdown to compare layouts.`);
  });

  $("save").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `favicon-collage-${lastMode || "chrono"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });
})();
