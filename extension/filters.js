/* Favicon Collage — domain filter presets (generic, no personal data).
 * Edit the arrays freely. A domain is KEPT unless a preset excludes it.
 */
(function (root) {
  function domainOf(url) {
    try { return new URL(url).hostname; } catch { return ""; }
  }

  // categories of "not really browsing you'd frame as art"
  const SOCIAL = ["facebook.", "instagram.", "twitter.", "tiktok.", "reddit.",
    "linkedin.", "pinterest.", "tumblr.", "snapchat.", "threads.net", "whatsapp."];
  const SEARCH = ["google.", "bing.com", "duckduckgo.", "yandex.", "baidu.",
    "ecosia.", "search.brave"];
  const GOOGLEINFRA = ["gstatic", "googleusercontent", "youtube.", "ytimg",
    "accounts.google", "docs.google", "drive.google", "gmail", "googlevideo"];
  const STREAM = ["netflix.", "hulu.", "twitch.", "disneyplus.", "hbomax.",
    "max.com", "primevideo", "spotify.", "soundcloud", "twitch.tv"];
  const SHOP = ["amazon.", "aliexpress.", "walmart.", "target.com", "bestbuy.",
    "ebay.", "wayfair.", "temu.", "shein."];
  const FINANCE = ["paypal.", "chase.com", "bankofamerica", "wellsfargo",
    "citibank", "venmo.", "coinbase.", "robinhood.", "stripe.com", "mint.com"];
  const DEV = ["github.com", "gitlab.", "stackoverflow.", "localhost",
    "127.0.0.1", "npmjs.", "vercel.app", "netlify.app"];
  const PRODUCTIVITY = ["notion.so", "slack.com", "zoom.us", "asana.", "trello.",
    "calendar.google", "office.com", "outlook."];
  const TRACK = ["doubleclick", "googlesyndication", "analytics", "adservice"];

  const NONART = [].concat(SOCIAL, SEARCH, GOOGLEINFRA, STREAM, SHOP, FINANCE,
    DEV, PRODUCTIVITY, TRACK);
  const DECLUTTER = [].concat(SOCIAL, SEARCH, GOOGLEINFRA, FINANCE, TRACK);

  const EXACT_DROP = new Set(["x.com", "t.co", "localhost"]);

  function excluder(list) {
    return (dom) => {
      const d = dom.toLowerCase();
      if (EXACT_DROP.has(d)) return false;
      if (d.startsWith("localhost") || d.startsWith("127.0.0.1")) return false;
      return !list.some((s) => d.includes(s));
    };
  }

  const hider = (list) => (dom) => {
    const d = dom.toLowerCase();
    return list.some((s) => d.includes(s));
  };

  root.FaviconFilter = {
    domainOf,
    // kept for the Python reference / parity
    presets: {
      everything: () => true,
      art: excluder(NONART),
      declutter: excluder(DECLUTTER),
    },
    // optional bulk-hide helpers for the domain checklist (true = suggest hiding)
    hide: {
      nonart: hider(NONART),
      declutter: hider(DECLUTTER),
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
