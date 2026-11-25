// Network Monitor - background service worker.
// Watches network traffic with the standard chrome.webRequest API (read-only,
// nothing is blocked or changed) and keeps a rolling log for the side panel.
// Uses only cross-browser chrome.* APIs so it runs in both Edge and Chrome.

const MAX_ENTRIES = 5000;      // oldest entries are dropped past this
const SAVE_DELAY_MS = 1000;    // how often the log is saved to session storage
const STORAGE_KEY = "nm_log";
const SETTINGS_KEY = "nm_settings";

let log = [];                  // array of request records, oldest first
let byId = new Map();          // requestId -> record (for in-flight updates)
let paused = false;
let loaded = false;
let saveTimer = null;
const ports = new Set();       // open side panels
let pendingPush = [];          // records changed since the last push
let pushTimer = null;

// Open the side panel when the toolbar button is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Service workers can be stopped by the browser at any time. We keep the log in
// session storage (cleared when the browser closes) so it survives restarts.
const ready = (async () => {
  try {
    const data = await chrome.storage.session.get([STORAGE_KEY, SETTINGS_KEY]);
    if (Array.isArray(data[STORAGE_KEY])) {
      log = data[STORAGE_KEY];
      for (const r of log) if (r.state === "pending") byId.set(r.reqId, r);
    }
    if (data[SETTINGS_KEY]) paused = !!data[SETTINGS_KEY].paused;
  } catch (e) {
    console.warn("Network Monitor: could not restore log", e);
  }
  loaded = true;
})();

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await chrome.storage.session.set({ [STORAGE_KEY]: log });
    } catch (e) {
      // Session storage has a size cap (about 10 MB). If we hit it, trim and retry.
      log = log.slice(Math.floor(log.length / 2));
      byId = new Map(log.map((r) => [r.id, r]));
      try { await chrome.storage.session.set({ [STORAGE_KEY]: log }); } catch (_) {}
    }
  }, SAVE_DELAY_MS);
}

// Batch updates to open side panels a few times per second.
function queuePush(record) {
  if (ports.size === 0) return;
  pendingPush.push(record);
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const batch = dedupe(pendingPush);
    pendingPush = [];
    for (const p of ports) {
      try { p.postMessage({ type: "update", records: batch }); } catch (_) {}
    }
  }, 250);
}

function dedupe(records) {
  const m = new Map();
  for (const r of records) m.set(r.id, r);
  return [...m.values()];
}

function isOwnRequest(details) {
  const self = chrome.runtime.getURL("");
  return (details.initiator && self.startsWith(details.initiator)) ||
         (details.url && details.url.startsWith(self));
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; }
}

// Rough "site" for a host name: the last two labels (example.com), or three for
// common two-part country endings (example.co.uk). Good enough to tell first-
// from third-party without shipping a full public-suffix list.
const TWO_PART = /\.(co|com|net|org|gov|edu|ac|ne|or)\.[a-z]{2}$/i;
function siteOf(host) {
  if (!host) return "";
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host; // IP address
  const parts = host.split(".");
  const n = TWO_PART.test(host) ? 3 : 2;
  return parts.slice(-n).join(".");
}

// Rough size of a list of headers as text ("Name: value\r\n" each). Browsers
// often compress headers on the wire (HTTP/2 and HTTP/3), so treat this as an
// estimate of the uncompressed size.
function headerBytes(headers) {
  if (!headers) return 0;
  let n = 0;
  for (const h of headers) n += h.name.length + (h.value ? utf8Len(h.value) : 0) + 4;
  return n;
}
function utf8Len(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3;
  }
  return n;
}

// Size of an upload (form or raw data). null when part of it is a file we can't measure.
function bodyBytes(body) {
  if (!body) return 0;
  if (body.error) return null;
  let n = 0;
  if (body.formData) {
    for (const [k, vals] of Object.entries(body.formData)) {
      for (const v of vals) n += encodeURIComponent(k).length + encodeURIComponent(v).length + 2;
    }
  }
  if (body.raw) {
    for (const part of body.raw) {
      if (part.bytes) n += part.bytes.byteLength;
      else if (part.file) return null;
    }
  }
  return n;
}

// "a=1; b=2" -> names and size. We keep cookie names and sizes, never values.
function parseCookieHeader(value) {
  const names = [];
  for (const part of value.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    names.push(eq < 0 ? p : p.slice(0, eq));
  }
  return { names, bytes: utf8Len(value) };
}

// One Set-Cookie header -> name, size and its settings (no value).
function parseSetCookie(value) {
  const parts = value.split(";");
  const first = parts.shift() || "";
  const eq = first.indexOf("=");
  const c = {
    n: (eq < 0 ? first : first.slice(0, eq)).trim(),
    b: utf8Len(value),           // size of the whole Set-Cookie line
    session: true,               // no expiry: deleted when the browser closes
    removed: false,              // the server is deleting the cookie
    secure: false, httpOnly: false, sameSite: ""
  };
  for (const raw of parts) {
    const a = raw.trim();
    const i = a.indexOf("=");
    const key = (i < 0 ? a : a.slice(0, i)).toLowerCase();
    const val = i < 0 ? "" : a.slice(i + 1).trim();
    if (key === "expires") {
      c.session = false;
      const t = Date.parse(val);
      if (!isNaN(t) && t < Date.now()) c.removed = true;
    } else if (key === "max-age") {
      c.session = false;
      if (+val <= 0) c.removed = true;
    } else if (key === "secure") c.secure = true;
    else if (key === "httponly") c.httpOnly = true;
    else if (key === "samesite") c.sameSite = val.toLowerCase();
  }
  return c;
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const h = headers.find((x) => x.name.toLowerCase() === name);
  return h ? h.value : undefined;
}

// ---- webRequest listeners -------------------------------------------------

const FILTER = { urls: ["<all_urls>"] };

// Chrome and Edge hide Cookie / Set-Cookie headers unless "extraHeaders" is
// asked for. Only ask when the browser supports it, so other browsers still work.
function withExtra(spec, optionsEnum) {
  return optionsEnum && optionsEnum.EXTRA_HEADERS ? [...spec, optionsEnum.EXTRA_HEADERS] : spec;
}

chrome.webRequest.onBeforeRequest.addListener((d) => {
  if (!loaded || paused || isOwnRequest(d)) return;
  const host = hostOf(d.url);
  const initiatorHost = d.initiator ? hostOf(d.initiator) : "";
  const record = {
    id: d.requestId + ":" + d.timeStamp.toFixed(0),
    reqId: d.requestId,
    start: d.timeStamp,
    end: null,
    method: d.method,
    url: d.url,
    host,
    site: siteOf(host),
    type: d.type,
    tabId: d.tabId,
    initiator: d.initiator || "",
    // Third-party = going to a different site than the page that asked for it.
    thirdParty: !!initiatorHost && siteOf(initiatorHost) !== siteOf(host),
    state: "pending",       // pending | done | redirect | failed
    status: null,
    statusText: "",
    fromCache: false,
    ip: "",
    secure: /^(https|wss):/i.test(d.url),
    size: null,             // bytes, from Content-Length when the server sends it
    reqHeaderBytes: null,   // estimated size of the request line + headers
    reqBodyBytes: bodyBytes(d.requestBody), // uploaded data; null if unknown
    resHeaderBytes: null,   // estimated size of the status line + response headers
    firstByte: null,        // time the response headers arrived
    cookiesSent: null,      // { names: [...], bytes } from the Cookie header
    cookiesSet: [],         // parsed Set-Cookie headers (names and settings, no values)
    contentType: "",
    redirectTo: "",
    error: ""
  };
  // A redirected request keeps the same requestId; the old record is already final.
  byId.set(d.requestId, record);
  log.push(record);
  if (log.length > MAX_ENTRIES) {
    const removed = log.splice(0, log.length - MAX_ENTRIES);
    for (const r of removed) if (byId.get(r.reqId) === r) byId.delete(r.reqId);
  }
  queuePush(record);
  scheduleSave();
}, FILTER, ["requestBody"]);

chrome.webRequest.onSendHeaders.addListener((d) => {
  const r = byId.get(d.requestId);
  if (!r) return;
  let line = 0;
  try { const u = new URL(d.url); line = d.method.length + (u.pathname + u.search).length + 12 + u.host.length + 8; } catch (_) {}
  r.reqHeaderBytes = line + headerBytes(d.requestHeaders);
  const cookie = getHeader(d.requestHeaders, "cookie");
  r.cookiesSent = cookie ? parseCookieHeader(cookie) : null;
  queuePush(r);
}, FILTER, withExtra(["requestHeaders"], chrome.webRequest.OnSendHeadersOptions));

chrome.webRequest.onHeadersReceived.addListener((d) => {
  const r = byId.get(d.requestId);
  if (!r) return;
  r.status = d.statusCode;
  r.statusText = d.statusLine || "";
  r.firstByte = d.timeStamp;
  r.resHeaderBytes = (d.statusLine || "").length + 2 + headerBytes(d.responseHeaders);
  const len = getHeader(d.responseHeaders, "content-length");
  if (len && !isNaN(+len)) r.size = +len;
  r.contentType = (getHeader(d.responseHeaders, "content-type") || "").split(";")[0];
  r.cookiesSet = [];
  for (const h of d.responseHeaders || []) {
    if (h.name.toLowerCase() !== "set-cookie" || !h.value) continue;
    for (const line of h.value.split("\n")) if (line.trim()) r.cookiesSet.push(parseSetCookie(line));
  }
  queuePush(r);
}, FILTER, withExtra(["responseHeaders"], chrome.webRequest.OnHeadersReceivedOptions));

chrome.webRequest.onBeforeRedirect.addListener((d) => {
  const r = byId.get(d.requestId);
  if (!r) return;
  r.state = "redirect";
  r.status = d.statusCode;
  r.redirectTo = d.redirectUrl;
  r.ip = d.ip || r.ip;
  r.fromCache = !!d.fromCache;
  r.end = d.timeStamp;
  byId.delete(d.requestId);
  queuePush(r);
  scheduleSave();
}, FILTER);

chrome.webRequest.onCompleted.addListener((d) => {
  const r = byId.get(d.requestId);
  if (!r) return;
  r.state = "done";
  r.status = d.statusCode;
  r.statusText = d.statusLine || r.statusText;
  r.ip = d.ip || "";
  r.fromCache = !!d.fromCache;
  r.end = d.timeStamp;
  byId.delete(d.requestId);
  queuePush(r);
  scheduleSave();
}, FILTER);

chrome.webRequest.onErrorOccurred.addListener((d) => {
  const r = byId.get(d.requestId);
  if (!r) return;
  r.state = "failed";
  r.error = d.error || "Unknown error";
  r.ip = d.ip || r.ip;
  r.end = d.timeStamp;
  byId.delete(d.requestId);
  queuePush(r);
  scheduleSave();
}, FILTER);

// ---- side panel communication ---------------------------------------------

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "sidepanel") return;
  await ready;
  ports.add(port);
  port.postMessage({ type: "init", records: log, paused });
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((msg) => {
    if (msg.type === "clear") {
      log = [];
      byId = new Map();
      chrome.storage.session.set({ [STORAGE_KEY]: [] });
      for (const p of ports) p.postMessage({ type: "init", records: [], paused });
    } else if (msg.type === "setPaused") {
      paused = !!msg.paused;
      chrome.storage.session.set({ [SETTINGS_KEY]: { paused } });
      for (const p of ports) p.postMessage({ type: "paused", paused });
    }
  });
});
