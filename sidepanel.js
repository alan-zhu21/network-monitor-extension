// Network Monitor - side panel UI.

const MAX_ROWS = 500; // rows drawn at once; filters and export still use everything

// Plain-language names for the request types the browser reports.
const KINDS = {
  main_frame:     { label: "Web page",      explain: "The main page you asked for." },
  sub_frame:      { label: "Embedded page", explain: "A page shown inside another page (an iframe), such as an ad, video player or login box." },
  stylesheet:     { label: "Styling",       explain: "A stylesheet (CSS) that controls how the page looks." },
  script:         { label: "Script",        explain: "JavaScript code that runs on the page. Third-party scripts are often analytics or ads." },
  image:          { label: "Image",         explain: "A picture or icon. Tiny invisible images are sometimes used for tracking." },
  font:           { label: "Font",          explain: "A typeface used to display text." },
  media:          { label: "Audio/Video",   explain: "Audio or video content." },
  xmlhttprequest: { label: "Data",          explain: "Data fetched in the background by a script (fetch/XHR), for example search suggestions, feeds or analytics." },
  ping:           { label: "Tracking ping", explain: "A small beacon sent to report that something happened, like a click or a page view." },
  websocket:      { label: "Live link",     explain: "A WebSocket: an open two-way connection for live updates such as chat or notifications." },
  csp_report:     { label: "Security report", explain: "The page reporting a broken security rule back to its server." },
  object:         { label: "Plugin",        explain: "Content loaded by a plugin or embedded object." },
  webbundle:      { label: "Bundle",        explain: "A packaged group of resources." },
  other:          { label: "Other",         explain: "A request the browser could not put in a more specific category." }
};
const kindOf = (t) => KINDS[t] || { label: t, explain: "" };

const ERRORS = {
  "net::ERR_BLOCKED_BY_CLIENT": "Blocked by the browser or another extension (for example an ad blocker or tracking prevention).",
  "net::ERR_BLOCKED_BY_RESPONSE": "The server's security rules stopped this from loading here.",
  "net::ERR_ABORTED": "Cancelled before it finished, usually because the page moved on or no longer needed it.",
  "net::ERR_NAME_NOT_RESOLVED": "The site name could not be found (DNS lookup failed).",
  "net::ERR_CONNECTION_REFUSED": "The server refused the connection.",
  "net::ERR_CONNECTION_RESET": "The connection was cut off unexpectedly.",
  "net::ERR_CONNECTION_TIMED_OUT": "The server took too long to respond.",
  "net::ERR_TIMED_OUT": "The request took too long and was given up on.",
  "net::ERR_INTERNET_DISCONNECTED": "There is no internet connection.",
  "net::ERR_CERT_AUTHORITY_INVALID": "The site's security certificate is not trusted.",
  "net::ERR_CERT_DATE_INVALID": "The site's security certificate has expired or is not valid yet.",
  "net::ERR_CACHE_MISS": "The browser needed to reload this but was not allowed to (often after going back)."
};

function resultOf(r) {
  if (r.state === "pending") return { key: "pending", label: "Loading…" };
  if (r.state === "failed") return { key: "failed", label: "Failed" };
  const s = r.status || 0;
  if (s >= 200 && s < 300) return { key: "ok", label: r.fromCache ? `${s} (cache)` : `${s} OK` };
  if (s >= 300 && s < 400) return { key: "redirect", label: `${s} Moved` };
  if (s >= 400 && s < 500) return { key: "client", label: `${s} Error` };
  if (s >= 500) return { key: "server", label: `${s} Error` };
  return { key: "ok", label: s ? String(s) : "Done" };
}

const STATUS_EXPLAIN = {
  200: "OK: the server sent back what was asked for.",
  204: "OK, but nothing to send back (common for tracking pings).",
  206: "Partial content: part of a file, used for video and large downloads.",
  301: "Moved permanently to a new address.",
  302: "Temporarily redirected to another address.",
  304: "Not modified: the browser's saved copy is still good, so nothing new was downloaded.",
  307: "Temporarily redirected to another address.",
  308: "Moved permanently to a new address.",
  400: "Bad request: the server did not understand the request.",
  401: "Login required.",
  403: "Forbidden: the server refused access.",
  404: "Not found: nothing exists at this address.",
  429: "Too many requests: the server is limiting how often you can ask.",
  500: "Server error: something broke on the server.",
  502: "Bad gateway: a server in the middle got a bad answer.",
  503: "Service unavailable: the server is overloaded or down for maintenance.",
  504: "Gateway timeout: a server in the middle gave up waiting."
};

// ---- state ----------------------------------------------------------------

let records = new Map();   // id -> record
let paused = false;
let currentTabId = null;
let selectedId = null;
let renderQueued = false;
let port = null;
let view = "requests";     // "requests" | "sites"
let catFilter = "";        // Sites tab: show only this category
let currentTabSite = "";

const $ = (id) => document.getElementById(id);
const els = {
  rows: $("rows"), empty: $("empty"), more: $("more"),
  search: $("search"), scope: $("scope"), typeFilter: $("typeFilter"),
  statusFilter: $("statusFilter"), siteFilter: $("siteFilter"), thirdOnly: $("thirdOnly"),
  pauseBtn: $("pauseBtn"), clearBtn: $("clearBtn"), exportBtn: $("exportBtn"), exportMenu: $("exportMenu"),
  pausedBanner: $("pausedBanner"), details: $("details"), detailsBody: $("detailsBody"),
  footerText: $("footerText"),
  table: $("table"), sitesView: $("sitesView"), siteCards: $("siteCards"),
  catChips: $("catChips"), sitesEmpty: $("sitesEmpty")
};

// Fill the "Any kind" dropdown.
for (const [key, k] of Object.entries(KINDS)) {
  const o = document.createElement("option");
  o.value = key; o.textContent = k.label;
  els.typeFilter.append(o);
}

// ---- connection to the background worker -----------------------------------

function connect() {
  port = chrome.runtime.connect({ name: "sidepanel" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "init") {
      records = new Map(msg.records.map((r) => [r.id, r]));
      setPaused(msg.paused);
      if (selectedId && !records.has(selectedId)) closeDetails();
    } else if (msg.type === "update") {
      for (const r of msg.records) records.set(r.id, r);
    } else if (msg.type === "paused") {
      setPaused(msg.paused);
    }
    queueRender();
  });
  // The browser may stop the background worker when idle; reconnect if so.
  port.onDisconnect.addListener(() => setTimeout(connect, 500));
}

async function updateCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab ? tab.id : null;
  currentTabSite = tab && tab.url ? siteOfHost(hostOfUrl(tab.url)) : "";
  queueRender();
}
chrome.tabs.onActivated.addListener(updateCurrentTab);
chrome.windows.onFocusChanged.addListener(updateCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === currentTabId && info.url) updateCurrentTab();
});

// ---- filtering ------------------------------------------------------------

function scopedRecords() {
  const all = [...records.values()];
  if (els.scope.value === "tab") return all.filter((r) => r.tabId === currentTabId);
  return all;
}

function applyFilters(list) {
  const q = els.search.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  const status = els.statusFilter.value;
  const site = els.siteFilter.value;
  const third = els.thirdOnly.checked;
  return list.filter((r) => {
    if (type && r.type !== type) return false;
    if (site && r.site !== site) return false;
    if (third && !r.thirdParty) return false;
    if (status && resultOf(r).key !== status) return false;
    if (q && !r.url.toLowerCase().includes(q) && !r.host.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ---- rendering ------------------------------------------------------------

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  const scoped = scopedRecords();
  updateSummary(scoped);
  updateSiteOptions(scoped);
  if (view === "sites") { renderSites(scoped); return; }

  const shown = applyFilters(scoped).sort((a, b) => b.start - a.start); // newest first
  const visible = shown.slice(0, MAX_ROWS);

  const frag = document.createDocumentFragment();
  for (const r of visible) frag.append(rowFor(r));
  els.rows.replaceChildren(frag);

  els.empty.hidden = shown.length > 0;
  if (scoped.length > 0 && shown.length === 0) {
    els.empty.textContent = "Nothing matches these filters.";
  } else {
    els.empty.textContent = els.scope.value === "tab"
      ? "No requests from this tab yet. Load or refresh the page to see what it connects to."
      : "No requests yet. Load or refresh a web page to see what it connects to.";
  }
  els.more.hidden = shown.length <= MAX_ROWS;
  els.more.textContent = `Showing the newest ${MAX_ROWS} of ${shown.length}. Use the filters to narrow it down (export includes all ${shown.length}).`;
  els.footerText.textContent = `${shown.length} shown · ${records.size} recorded in total`;

  if (selectedId && records.has(selectedId)) showDetails(records.get(selectedId), false);
}

function rowFor(r) {
  const tr = document.createElement("tr");
  tr.dataset.id = r.id;
  if (r.id === selectedId) tr.className = "selected";

  const time = document.createElement("td");
  time.className = "c-time";
  time.textContent = clock(r.start);

  const kind = document.createElement("td");
  kind.className = "c-kind";
  kind.textContent = kindOf(r.type).label;
  kind.title = kindOf(r.type).explain;

  const site = document.createElement("td");
  const name = document.createElement("span");
  name.className = "site-name";
  name.textContent = r.host;
  if (r.thirdParty) {
    const tag = document.createElement("span");
    tag.className = "tag third";
    tag.textContent = "3rd party";
    tag.title = "Sent to a different site than the page that asked for it";
    name.append(tag);
  }
  const path = document.createElement("span");
  path.className = "path";
  path.textContent = pathOf(r.url);
  site.append(name, path);
  site.title = r.url;

  const res = resultOf(r);
  const status = document.createElement("td");
  status.className = "c-status st-" + res.key;
  status.textContent = res.label;
  if (r.error) status.title = r.error;

  tr.append(time, kind, site, status);
  return tr;
}

function updateSummary(list) {
  const sites = new Set(list.map((r) => r.site));
  $("statTotal").textContent = list.length;
  $("statSites").textContent = sites.size;
  $("statThird").textContent = list.filter((r) => r.thirdParty).length;
  $("statFailed").textContent = list.filter((r) => ["failed", "client", "server"].includes(resultOf(r).key)).length;
}

function updateSiteOptions(list) {
  const counts = new Map();
  for (const r of list) counts.set(r.site, (counts.get(r.site) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const current = els.siteFilter.value;
  const key = sorted.map(([s, n]) => s + n).join("|");
  if (els.siteFilter.dataset.key === key) return; // unchanged, avoid flicker
  els.siteFilter.dataset.key = key;
  const opts = [new Option("Any site", "")];
  for (const [s, n] of sorted) opts.push(new Option(`${s} (${n})`, s));
  if (current && !counts.has(current)) opts.push(new Option(`${current} (0)`, current));
  els.siteFilter.replaceChildren(...opts);
  els.siteFilter.value = current;
}

// ---- sites view -----------------------------------------------------------

// Sites of the pages being viewed: every top-level page load, plus the current tab.
function pageSitesOf(list) {
  const s = new Set();
  for (const r of list) if (r.type === "main_frame") s.add(r.site);
  if (currentTabSite && els.scope.value === "tab") s.add(currentTabSite);
  return s;
}

function groupBySite(list) {
  const m = new Map();
  for (const r of list) {
    if (!r.site) continue;
    let g = m.get(r.site);
    if (!g) m.set(r.site, (g = { site: r.site, records: [] }));
    g.records.push(r);
  }
  return [...m.values()];
}

function describeSites(list) {
  const pageSites = pageSitesOf(list);
  return groupBySite(list).map((g) => ({ ...g, info: classifySite(g.site, g.records, pageSites) }));
}

function badgeClass(cat) {
  if (cat === "self" || cat === "related") return "badge self";
  if (TRACKING_CATEGORIES.has(cat)) return "badge track";
  if (cat === "unknown") return "badge unknown";
  return "badge";
}

function renderSites(scoped) {
  const groups = describeSites(scoped);

  // Category chips: "All (12)", "Advertising (3)", ...
  const counts = new Map();
  for (const g of groups) counts.set(g.info.cat, (counts.get(g.info.cat) || 0) + 1);
  if (catFilter && !counts.has(catFilter)) catFilter = "";
  const order = Object.keys(SITE_CATEGORIES).filter((c) => counts.has(c));
  const chipKey = catFilter + "|" + order.map((c) => c + counts.get(c)).join(",");
  if (els.catChips.dataset.key !== chipKey) {
    els.catChips.dataset.key = chipKey;
    const chips = [chip("", `All (${groups.length})`)];
    for (const c of order) chips.push(chip(c, `${SITE_CATEGORIES[c].label} (${counts.get(c)})`));
    els.catChips.replaceChildren(...chips);
  }

  const q = els.search.value.trim().toLowerCase();
  const shown = groups.filter((g) => {
    if (catFilter && g.info.cat !== catFilter) return false;
    if (!q) return true;
    const text = [g.site, g.info.owner, g.info.name, SITE_CATEGORIES[g.info.cat].label, ...g.info.hosts.map(([h]) => h)].join(" ").toLowerCase();
    return text.includes(q);
  }).sort((a, b) => (b.info.cat === "self") - (a.info.cat === "self") || b.records.length - a.records.length);

  const frag = document.createDocumentFragment();
  for (const g of shown) frag.append(siteCard(g));
  els.siteCards.replaceChildren(frag);

  els.sitesEmpty.hidden = shown.length > 0;
  els.sitesEmpty.textContent = groups.length
    ? "No sites match."
    : "No sites yet. Load or refresh a web page to see who it talks to.";
  const tracking = groups.filter((g) => TRACKING_CATEGORIES.has(g.info.cat)).length;
  els.footerText.textContent = `${groups.length} sites · ${tracking} ads, analytics or social`;
}

function chip(cat, text) {
  const b = document.createElement("button");
  b.className = "chip" + (cat === catFilter ? " on" : "");
  b.dataset.cat = cat;
  b.textContent = text;
  if (cat) b.title = SITE_CATEGORIES[cat].explain;
  return b;
}

function siteCard(g) {
  const info = g.info;
  const cat = SITE_CATEGORIES[info.cat];
  const card = document.createElement("div");
  card.className = "site-card";
  card.dataset.site = g.site;
  card.title = "Show the requests sent to " + g.site;

  const top = document.createElement("div");
  top.className = "site-top";
  const name = document.createElement("span");
  name.className = "site-title";
  name.textContent = g.site;
  const count = document.createElement("span");
  count.className = "site-count";
  count.textContent = g.records.length === 1 ? "1 request" : `${g.records.length} requests`;
  top.append(name, count);

  const purpose = document.createElement("div");
  purpose.className = "site-purpose";
  const badge = document.createElement("span");
  badge.className = badgeClass(info.cat);
  badge.textContent = cat.label;
  purpose.append(badge);
  if (info.name || info.owner) {
    const who = document.createElement("span");
    who.className = "site-owner";
    who.textContent = info.name && info.owner && !info.name.includes(info.owner)
      ? `${info.name} · ${info.owner}` : (info.name || info.owner);
    purpose.append(who);
  }

  const explain = document.createElement("div");
  explain.className = "explain";
  explain.textContent = cat.explain;

  const how = document.createElement("div");
  how.className = "site-how";
  if (info.how === "known") how.textContent = "Known service (from the built-in list)";
  else if (info.how === "guess") how.textContent = "Best guess: " + info.reason + ".";
  else if (info.how === "none") how.textContent = "Not enough clues to tell. Check the requests to learn more.";
  else how.textContent = "";

  const mix = document.createElement("div");
  mix.className = "site-mix";
  mix.textContent = trafficSummary(g.records, info);

  card.append(top, purpose, explain);
  if (how.textContent) card.append(how);
  card.append(mix);
  return card;
}

// "Mostly: Script 10 · Image 4 · via fonts.googleapis.com, …"
function trafficSummary(records, info) {
  const kinds = new Map();
  for (const r of records) {
    const k = kindOf(r.type).label;
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  const parts = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`);
  let text = parts.join(" · ");
  if (info.hosts.length > 1) {
    const hs = info.hosts.slice(0, 3).map(([h, n]) => {
      const c = classifyHost(h);
      const label = c && c !== info.cat ? ` (${SITE_CATEGORIES[c].label.toLowerCase()})` : "";
      return `${h}${label}`;
    });
    text += `  ·  Addresses: ${hs.join(", ")}${info.hosts.length > 3 ? `, +${info.hosts.length - 3} more` : ""}`;
  }
  return text;
}

function setView(v) {
  view = v;
  document.body.classList.toggle("view-sites", v === "sites");
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("on", b.dataset.view === v);
  els.table.hidden = v === "sites";
  els.sitesView.hidden = v !== "sites";
  if (v === "sites") { els.empty.hidden = true; els.more.hidden = true; closeDetails(); }
  els.search.placeholder = v === "sites" ? "Search site, company or purpose…" : "Search address or site…";
  queueRender();
}

// Purpose line for the request details pane.
function purposeRow(r) {
  const list = [...records.values()].filter((x) => x.site === r.site && (els.scope.value !== "tab" || x.tabId === currentTabId));
  const info = classifySite(r.site, list.length ? list : [r], pageSitesOf(scopedRecords()));
  const cat = SITE_CATEGORIES[info.cat];
  const who = info.name || info.owner;
  return ["Site purpose", cat.label + (who ? ` (${who})` : "") + (info.how === "guess" ? " · best guess" : ""), cat.explain];
}

// ---- details --------------------------------------------------------------

function showDetails(r, scroll = true) {
  selectedId = r.id;
  const res = resultOf(r);
  const k = kindOf(r.type);
  const items = [
    ["Address", r.url],
    ["Site", r.site + (r.thirdParty ? " (third-party)" : ""),
      r.thirdParty ? "This went to a different site than the page that asked for it. Often ads, analytics or a content delivery network." : ""],
    purposeRow(r),
    ["Asked for by", r.initiator || (r.tabId === -1 ? "The browser itself (not a tab)" : "You, by opening the page")],
    ["Kind", k.label, k.explain],
    ["Method", r.method, methodExplain(r.method)],
    ["Result", res.label + (r.statusText ? `  ·  ${r.statusText}` : ""), r.error ? (ERRORS[r.error] || r.error) : (STATUS_EXPLAIN[r.status] || "")],
    r.redirectTo ? ["Sent on to", r.redirectTo] : null,
    ["Time", new Date(r.start).toLocaleString()],
    ["Took", r.end ? `${Math.round(r.end - r.start)} ms` : "Still loading"],
    ["Size", r.size != null ? formatBytes(r.size) : (r.fromCache ? "Loaded from the browser's cache" : "Not reported by the server")],
    r.contentType ? ["Content type", r.contentType] : null,
    ["Server IP", r.ip || "Not known", r.fromCache ? "Served from the browser's saved copy, so no server was contacted." : ""],
    ["Tab", r.tabId === -1 ? "None (background)" : String(r.tabId)]
  ].filter(Boolean);

  const dl = document.createElement("dl");
  for (const [label, value, explain] of items) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    if (explain) {
      const p = document.createElement("div");
      p.className = "explain";
      p.textContent = explain;
      dd.append(p);
    }
    dl.append(dt, dd);
  }
  els.detailsBody.replaceChildren(dl);
  els.details.hidden = false;
  for (const tr of els.rows.querySelectorAll("tr.selected")) tr.classList.remove("selected");
  const row = els.rows.querySelector(`tr[data-id="${CSS.escape(r.id)}"]`);
  if (row) row.classList.add("selected");
  if (scroll) els.details.scrollTop = 0;
}

function closeDetails() {
  selectedId = null;
  els.details.hidden = true;
  for (const tr of els.rows.querySelectorAll("tr.selected")) tr.classList.remove("selected");
}

function methodExplain(m) {
  switch (m) {
    case "GET": return "Asking to receive something.";
    case "POST": return "Sending data to the server (a form, a login, analytics events…).";
    case "PUT": case "PATCH": return "Updating something on the server.";
    case "DELETE": return "Asking the server to delete something.";
    case "OPTIONS": return "A permission check the browser makes before certain cross-site requests.";
    case "HEAD": return "Asking only for information about something, not the thing itself.";
    default: return "";
  }
}

// ---- export ---------------------------------------------------------------

const EXPORT_FIELDS = [
  ["time", (r) => new Date(r.start).toISOString()],
  ["method", (r) => r.method],
  ["url", (r) => r.url],
  ["host", (r) => r.host],
  ["site", (r) => r.site],
  ["third_party", (r) => r.thirdParty ? "yes" : "no"],
  ["kind", (r) => kindOf(r.type).label],
  ["type", (r) => r.type],
  ["result", (r) => resultOf(r).key],
  ["status_code", (r) => r.status ?? ""],
  ["error", (r) => r.error],
  ["from_cache", (r) => r.fromCache ? "yes" : "no"],
  ["duration_ms", (r) => r.end ? Math.round(r.end - r.start) : ""],
  ["size_bytes", (r) => r.size ?? ""],
  ["content_type", (r) => r.contentType],
  ["server_ip", (r) => r.ip],
  ["initiator", (r) => r.initiator],
  ["redirect_to", (r) => r.redirectTo],
  ["tab_id", (r) => r.tabId],
  ["site_purpose", (r, p) => p.get(r.site) || ""]
];

function exportData(format) {
  const list = applyFilters(scopedRecords()).sort((a, b) => a.start - b.start);
  const purposes = new Map(describeSites(scopedRecords()).map((g) => [g.site, SITE_CATEGORIES[g.info.cat].label]));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let blob, name;
  if (format === "csv") {
    const esc = (v) => {
      let s = String(v ?? "");
      // Stop spreadsheet apps from treating values as formulas.
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [EXPORT_FIELDS.map(([h]) => h).join(",")];
    for (const r of list) lines.push(EXPORT_FIELDS.map(([, f]) => esc(f(r, purposes))).join(","));
    blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    name = `network-log-${stamp}.csv`;
  } else {
    const out = list.map((r) => Object.fromEntries(EXPORT_FIELDS.map(([h, f]) => [h, f(r, purposes)])));
    blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), count: out.length, requests: out }, null, 2)], { type: "application/json" });
    name = `network-log-${stamp}.json`;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---- helpers --------------------------------------------------------------

function clock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}
function hostOfUrl(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; }
}
function pathOf(url) {
  try { const u = new URL(url); return (u.pathname + u.search) || "/"; } catch (_) { return url; }
}
function formatBytes(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function setPaused(p) {
  paused = p;
  els.pauseBtn.textContent = p ? "Resume" : "Pause";
  els.pauseBtn.classList.toggle("active", p);
  els.pausedBanner.hidden = !p;
}

// ---- events ---------------------------------------------------------------

for (const el of [els.search, els.scope, els.typeFilter, els.statusFilter, els.siteFilter, els.thirdOnly]) {
  el.addEventListener("input", queueRender);
  el.addEventListener("change", queueRender);
}

els.rows.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (tr && records.has(tr.dataset.id)) showDetails(records.get(tr.dataset.id));
});
$("closeDetails").addEventListener("click", closeDetails);

for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => setView(b.dataset.view));
els.catChips.addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  catFilter = b.dataset.cat === catFilter ? "" : b.dataset.cat;
  queueRender();
});
// Clicking a site card jumps to its requests.
els.siteCards.addEventListener("click", (e) => {
  const card = e.target.closest(".site-card");
  if (!card) return;
  els.search.value = "";
  els.siteFilter.value = card.dataset.site;
  setView("requests");
});

els.pauseBtn.addEventListener("click", () => port.postMessage({ type: "setPaused", paused: !paused }));
els.clearBtn.addEventListener("click", () => { closeDetails(); port.postMessage({ type: "clear" }); });

els.exportBtn.addEventListener("click", (e) => { e.stopPropagation(); els.exportMenu.hidden = !els.exportMenu.hidden; });
els.exportMenu.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-format]");
  if (!b) return;
  els.exportMenu.hidden = true;
  exportData(b.dataset.format);
});
document.addEventListener("click", () => { els.exportMenu.hidden = true; });

$("helpLink").addEventListener("click", (e) => { e.preventDefault(); $("help").hidden = false; });
$("closeHelp").addEventListener("click", () => { $("help").hidden = true; });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("help").hidden = true; closeDetails(); }
});

connect();
updateCurrentTab();
