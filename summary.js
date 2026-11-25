// Network Monitor - Summary tab.
// Adds up the recorded traffic: data sent and received, cookies, and a few
// plain-language insights. Uses helpers from sidepanel.js (loaded after this
// file), which is fine because these functions only run once the panel is up.

// ---- per-request numbers --------------------------------------------------

// Did we expect no content in this response? (Then a missing size isn't a gap.)
function noBodyExpected(r) {
  const s = r.status || 0;
  return r.method === "HEAD" || s === 204 || s === 304 || (s >= 100 && s < 200) ||
         r.state === "redirect" || (r.state === "failed" && !s) || r.type === "websocket";
}

// Bytes sent and received for one request. Header sizes are estimates.
function trafficOf(r) {
  const t = {
    sentHeaders: r.reqHeaderBytes || 0,
    sentBody: r.reqBodyBytes || 0,
    bodyUnknownUpload: r.reqBodyBytes === null,
    recvHeaders: 0, recvBody: 0, recvUnknown: false, cached: !!r.fromCache
  };
  if (!t.cached) {
    t.recvHeaders = r.resHeaderBytes || 0;
    if (r.size != null) t.recvBody = r.size;
    else if (r.state !== "pending" && !noBodyExpected(r)) t.recvUnknown = true;
  }
  t.sent = t.sentHeaders + t.sentBody;
  t.recv = t.recvHeaders + t.recvBody;
  return t;
}

function durationOf(r) { return r.end ? r.end - r.start : null; }
function pct(a, b) {
  if (!b) return 0;
  const p = Math.round((a / b) * 100);
  if (p === 0 && a > 0) return "less than 1";
  if (p === 100 && a < b) return "over 99";
  return p;
}
function plural(n, one, many) { return `${n.toLocaleString()} ${n === 1 ? one : (many || one + "s")}`; }

// ---- rendering ------------------------------------------------------------

function renderSummary(scoped) {
  const box = els.summaryBody;
  const done = scoped.filter((r) => r.state !== "pending");
  els.footerText.textContent = `Summary of ${plural(scoped.length, "request")}`;
  els.summaryEmpty.hidden = scoped.length > 0;
  if (!scoped.length) {
    els.summaryEmpty.textContent = "Nothing recorded yet. Load or refresh a web page, then come back here.";
    box.replaceChildren();
    return;
  }
  const frag = document.createDocumentFragment();
  frag.append(dataSection(scoped), cookieSection(scoped), insightSection(scoped, done));
  box.replaceChildren(frag);
}

function dataSection(list) {
  let sentH = 0, sentB = 0, recvH = 0, recvB = 0, unknown = 0, cached = 0, uploads = 0, unknownUploads = 0;
  const byKind = new Map(), bySite = new Map();
  for (const r of list) {
    const t = trafficOf(r);
    sentH += t.sentHeaders; sentB += t.sentBody; recvH += t.recvHeaders; recvB += t.recvBody;
    if (t.recvUnknown) unknown++;
    if (t.cached) cached++;
    if (t.sentBody > 0) uploads++;
    if (t.bodyUnknownUpload) unknownUploads++;
    const k = kindOf(r.type).label;
    byKind.set(k, (byKind.get(k) || 0) + t.recv);
    const s = bySite.get(r.site) || { recv: 0, sent: 0, third: false };
    s.recv += t.recv; s.sent += t.sent; s.third = s.third || r.thirdParty;
    bySite.set(r.site, s);
  }
  const sec = section("Data in and out",
    "How much your browser sent to servers (outgoing) and got back (incoming).");

  sec.append(tiles([
    ["↑ " + formatBytes(sentH + sentB), "sent (estimated)"],
    ["↓ " + formatBytes(recvH + recvB) + (unknown ? "+" : ""), "received" + (unknown ? " (at least)" : "")]
  ]));

  const facts = [
    `Sent: ${formatBytes(sentH)} of request headers (estimated) and ${formatBytes(sentB)} of uploaded data in ${plural(uploads, "request")}.` +
      (unknownUploads ? ` ${plural(unknownUploads, "upload")} included a file whose size extensions can't see.` : ""),
    `Received: ${formatBytes(recvH)} of response headers (estimated) and ${formatBytes(recvB)} of content.`
  ];
  if (unknown) facts.push(`${plural(unknown, "response")} (${pct(unknown, list.length)}% of requests) didn't say how big they were, so the real amount received is higher than shown.`);
  if (cached) facts.push(`${plural(cached, "request was", "requests were")} answered from the browser's saved copy (cache), so nothing was downloaded for them.`);
  sec.append(factList(facts));

  sec.append(subhead("Received, by kind of content"));
  sec.append(bars([...byKind.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => ({ label: k, value: v, text: formatBytes(v) }))));

  sec.append(subhead("Sites you got the most data from"));
  sec.append(bars([...bySite.entries()].filter(([, s]) => s.recv > 0).sort((a, b) => b[1].recv - a[1].recv).slice(0, 6)
    .map(([site, s]) => ({ label: site, value: s.recv, text: formatBytes(s.recv), third: s.third, site }))));

  sec.append(note("Header sizes are estimated from the header text. HTTP/2 and HTTP/3 compress headers, so the real amount on the wire is usually smaller. Content sizes come from the server's Content-Length header, which normally is the compressed size that was actually transferred. Extensions can't measure content that arrives without that header."));
  return sec;
}

function cookieSection(list) {
  let reqWith = 0, sentBytes = 0, sentCount = 0, sent1 = 0, sent3 = 0;
  const set = [];
  const sites = new Map();
  const site = (s) => {
    let x = sites.get(s);
    if (!x) sites.set(s, (x = { site: s, reqs: 0, bytes: 0, names: new Set(), set: 0, third: false }));
    return x;
  };
  for (const r of list) {
    if (r.cookiesSent && r.cookiesSent.names.length) {
      reqWith++;
      sentBytes += r.cookiesSent.bytes;
      sentCount += r.cookiesSent.names.length;
      if (r.thirdParty) sent3 += r.cookiesSent.bytes; else sent1 += r.cookiesSent.bytes;
      const x = site(r.site);
      x.reqs++; x.bytes += r.cookiesSent.bytes; x.third = x.third || r.thirdParty;
      for (const n of r.cookiesSent.names) x.names.add(n);
    }
    for (const c of r.cookiesSet || []) {
      set.push({ ...c, third: r.thirdParty });
      const x = site(r.site);
      x.set++; x.third = x.third || r.thirdParty;
      x.names.add(c.n);
    }
  }

  const sec = section("Cookies",
    "Cookies are small pieces of data a site stores in your browser. Your browser sends them back with every request to that site. They keep you signed in and remember settings, and they are also used to recognise you across visits and across sites.");

  const unique = [...sites.values()].reduce((n, s) => n + s.names.size, 0);
  sec.append(tiles([
    [`${reqWith.toLocaleString()} of ${list.length.toLocaleString()}`, "requests carried cookies"],
    [formatBytes(sentBytes), "cookie data sent"],
    [set.length.toLocaleString(), "cookies set by servers"]
  ]));

  if (!reqWith && !set.length) {
    sec.append(factList(["No cookies were sent or set in the traffic recorded so far."]));
    return sec;
  }

  const set3 = set.filter((c) => c.third).length;
  const session = set.filter((c) => c.session).length;
  const removed = set.filter((c) => c.removed).length;
  const kept = set.length - session - removed;
  const facts = [
    `${unique.toLocaleString()} different cookies seen (counted per site). Because the same cookies go out again with every request, ${plural(sentCount, "cookie")} were sent in total.`,
    `First-party cookies (to the site you're on): ${formatBytes(sent1)} sent. Third-party cookies (to other companies' sites): ${formatBytes(sent3)} sent.`
  ];
  if (set.length) {
    facts.push(`Of the ${plural(set.length, "cookie")} servers asked to set, ${session.toLocaleString()} ${session === 1 ? "is a session cookie" : "are session cookies"} (deleted when you close the browser), ${kept.toLocaleString()} ${kept === 1 ? "has" : "have"} an expiry date (kept between visits)` +
      (removed ? `, and ${removed.toLocaleString()} ${removed === 1 ? "was a request" : "were requests"} to delete an existing cookie` : "") + ".");
    facts.push(`${set3.toLocaleString()} of them came from third-party sites. Your browser's tracking prevention may block some of those, so this counts what servers asked for, not necessarily what was stored.`);
    const notSecure = set.filter((c) => !c.secure && !c.removed).length;
    const scriptable = set.filter((c) => !c.httpOnly && !c.removed).length;
    if (notSecure) facts.push(`${plural(notSecure, "cookie")} ${notSecure === 1 ? "isn't" : "aren't"} marked Secure, so ${notSecure === 1 ? "it" : "they"} could also be sent over unencrypted connections.`);
    if (scriptable) facts.push(`${plural(scriptable, "cookie")} ${scriptable === 1 ? "isn't" : "aren't"} marked HttpOnly, so scripts on the page (including third-party scripts) can read ${scriptable === 1 ? "it" : "them"}.`);
  }
  sec.append(factList(facts));

  sec.append(subhead("Cookies by site"));
  const rows = [...sites.values()].sort((a, b) => (b.bytes + b.set * 100) - (a.bytes + a.set * 100)).slice(0, 15);
  const table = document.createElement("table");
  table.className = "mini";
  const head = document.createElement("tr");
  for (const [h, tip] of [["Site", ""], ["Cookies", "Different cookie names seen for this site"], ["Sent", "Cookie data sent: requests carrying cookies · total size"], ["Set", "Cookies the site's servers asked to set"]]) {
    const th = document.createElement("th");
    th.textContent = h; if (tip) th.title = tip;
    head.append(th);
  }
  table.append(head);
  for (const s of rows) {
    const tr = document.createElement("tr");
    tr.className = "link";
    tr.title = "Show the requests sent to " + s.site;
    tr.addEventListener("click", () => openSite(s.site));
    const name = document.createElement("td");
    name.textContent = s.site;
    if (s.third) name.append(thirdTag());
    tr.append(name, cell(s.names.size), cell(s.reqs ? `${s.reqs} · ${formatBytes(s.bytes)}` : "none"), cell(s.set || "none"));
    table.append(tr);
  }
  sec.append(table);
  if (sites.size > rows.length) sec.append(note(`Showing the top ${rows.length} of ${sites.size} sites.`));

  sec.append(note("Only cookies that travel in network requests are counted. Cookies a page creates with JavaScript show up here once they are sent with a request. Names and sizes are shown, never cookie values."));
  return sec;
}

function insightSection(list, done) {
  const sec = section("Other things worth knowing", "");

  // Encryption
  const insecure = list.filter((r) => /^(http|ws):/i.test(r.url));
  const facts = [];
  facts.push(insecure.length
    ? `${pct(list.length - insecure.length, list.length)}% of requests were encrypted (HTTPS). ${plural(insecure.length, "request")} used plain HTTP, which anyone on the same network could read or change. They went to: ${[...new Set(insecure.map((r) => r.host))].slice(0, 5).join(", ")}.`
    : "Every request was encrypted (HTTPS), so people on the same network can see which sites you contact but not what is sent.");

  // Third parties
  let recvAll = 0, recv3 = 0;
  for (const r of list) { const t = trafficOf(r).recv; recvAll += t; if (r.thirdParty) recv3 += t; }
  const third = list.filter((r) => r.thirdParty);
  const thirdSites = new Set(third.map((r) => r.site));
  facts.push(`${pct(third.length, list.length)}% of requests and ${pct(recv3, recvAll)}% of the data received involved third parties: ${plural(thirdSites.size, "other site")} besides the one you visited.`);

  // Ads, analytics, social
  const groups = describeSites(list);
  const tracking = groups.filter((g) => TRACKING_CATEGORIES.has(g.info.cat));
  const trackingReqs = tracking.reduce((n, g) => n + g.records.length, 0);
  const pings = list.filter((r) => r.type === "ping").length;
  if (tracking.length || pings) {
    facts.push(`${plural(trackingReqs, "request")} went to sites used for ads, analytics or social media (${plural(tracking.length, "site")})` +
      (pings ? `, including ${plural(pings, "tracking ping")}.` : "."));
  }

  // Speed
  const timed = done.filter((r) => r.type !== "websocket" && durationOf(r) != null && !r.fromCache);
  if (timed.length) {
    const ds = timed.map(durationOf).sort((a, b) => a - b);
    const median = ds[Math.floor(ds.length / 2)];
    const slow = ds.filter((d) => d > 1000).length;
    facts.push(`A typical request took ${Math.round(median)} ms to finish.` +
      (slow ? ` ${plural(slow, "request")} took longer than a second.` : ""));
  }

  // Problems
  const failed = list.filter((r) => ["failed", "client", "server"].includes(resultOf(r).key));
  const blocked = list.filter((r) => r.error === "net::ERR_BLOCKED_BY_CLIENT").length;
  const redirects = list.filter((r) => r.state === "redirect").length;
  if (failed.length) facts.push(`${plural(failed.length, "request")} failed or got an error back` +
    (blocked ? `, ${blocked.toLocaleString()} of them blocked by the browser or another extension (for example an ad blocker or tracking prevention)` : "") + ".");
  if (redirects) facts.push(`${plural(redirects, "request was", "requests were")} redirected to another address. Chains of redirects are common in ad and link tracking.`);
  sec.append(factList(facts));

  // Top lists
  const biggest = list.map((r) => [r, trafficOf(r)]).filter(([, t]) => t.recvBody > 0).sort((a, b) => b[1].recv - a[1].recv).slice(0, 5);
  if (biggest.length) {
    sec.append(subhead("Biggest downloads"));
    sec.append(requestList(biggest.map(([r, t]) => [r, formatBytes(t.recv)])));
  }
  const slowest = timed.sort((a, b) => durationOf(b) - durationOf(a)).slice(0, 5);
  if (slowest.length) {
    sec.append(subhead("Slowest requests"));
    sec.append(requestList(slowest.map((r) => {
      const wait = r.firstByte ? Math.round(r.firstByte - r.start) : null;
      return [r, `${Math.round(durationOf(r))} ms`, wait != null ? `waited ${wait} ms for the server to answer` : ""];
    })));
  }
  return sec;
}

// ---- small building blocks ---------------------------------------------------

function section(title, intro) {
  const s = document.createElement("section");
  s.className = "sum-section";
  const h = document.createElement("h3");
  h.textContent = title;
  s.append(h);
  if (intro) {
    const p = document.createElement("p");
    p.className = "sum-intro";
    p.textContent = intro;
    s.append(p);
  }
  return s;
}

function subhead(text) {
  const h = document.createElement("h4");
  h.textContent = text;
  return h;
}

function tiles(items) {
  const d = document.createElement("div");
  d.className = "sum-tiles";
  for (const [value, label] of items) {
    const t = document.createElement("div");
    t.className = "stat";
    const v = document.createElement("span");
    v.textContent = value;
    const l = document.createElement("label");
    l.textContent = label;
    t.append(v, l);
    d.append(t);
  }
  return d;
}

function factList(lines) {
  const ul = document.createElement("ul");
  ul.className = "facts";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.append(li);
  }
  return ul;
}

function note(text) {
  const p = document.createElement("p");
  p.className = "sum-note";
  p.textContent = text;
  return p;
}

function cell(v) {
  const td = document.createElement("td");
  td.textContent = String(v);
  return td;
}

function thirdTag() {
  const tag = document.createElement("span");
  tag.className = "tag third";
  tag.textContent = "3rd party";
  return tag;
}

// Horizontal bar list. Items: { label, value, text, third?, site? }
function bars(items) {
  const wrap = document.createElement("div");
  wrap.className = "bars";
  const max = Math.max(1, ...items.map((i) => i.value));
  for (const i of items) {
    const row = document.createElement("div");
    row.className = "bar-row" + (i.site ? " link" : "");
    if (i.site) {
      row.title = "Show the requests sent to " + i.site;
      row.addEventListener("click", () => openSite(i.site));
    }
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = i.label;
    if (i.third) label.append(thirdTag());
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = Math.max(2, (i.value / max) * 100) + "%";
    track.append(fill);
    const val = document.createElement("span");
    val.className = "bar-val";
    val.textContent = i.text;
    row.append(label, track, val);
    wrap.append(row);
  }
  if (!items.length) wrap.append(note("Nothing to show yet."));
  return wrap;
}

// List of individual requests; click one to see its details.
function requestList(items) {
  const ul = document.createElement("ul");
  ul.className = "req-list";
  for (const [r, value, extra] of items) {
    const li = document.createElement("li");
    li.className = "link";
    li.title = r.url;
    li.addEventListener("click", () => openRequest(r));
    const top = document.createElement("div");
    top.className = "req-top";
    const name = document.createElement("span");
    name.className = "req-name";
    name.textContent = `${kindOf(r.type).label} · ${r.host}`;
    if (r.thirdParty) name.append(thirdTag());
    const v = document.createElement("span");
    v.className = "req-val";
    v.textContent = value;
    top.append(name, v);
    const path = document.createElement("div");
    path.className = "path";
    path.textContent = pathOf(r.url) + (extra ? `  ·  ${extra}` : "");
    li.append(top, path);
    ul.append(li);
  }
  return ul;
}

function openSite(site) {
  els.search.value = "";
  els.siteFilter.value = site;
  setView("requests");
}

function openRequest(r) {
  setView("requests");
  showDetails(r);
}
