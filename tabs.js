// Network Monitor - Tabs view.
// Links network activity back to the browser tab it came from, and lays out
// redirect chains step by step (original address, each hop, final address).
// Uses globals from sidepanel.js: records, tabInfo, currentTabId, els, kindOf,
// resultOf, STATUS_EXPLAIN, ERRORS, clock, siteOfHost, hostOfUrl, setView, showDetails.

const MAX_CHAINS_PER_TAB = 15;
const MAX_PAGES_PER_TAB = 10;

const expandedTabs = new Set();   // tab cards the user opened
const collapsedTabs = new Set();  // tab cards the user closed (the current tab starts open)

// Display name for any tab id, including closed tabs and the browser itself.
function tabLabel(tabId) {
  if (tabId === -1) return "Browser background (no tab)";
  const t = tabInfo.get(tabId);
  if (!t) return `Tab ${tabId}`;
  return t.title || hostOfUrl(t.url) || t.url || `Tab ${tabId}`;
}

// Short "Tab: title" text, used in dropdowns and rows.
function shortTabLabel(tabId, max = 40) {
  const s = tabLabel(tabId);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Group the hops of each redirect chain, in order.
function chainsOf(list) {
  const m = new Map();
  for (const r of list) {
    if (!r.chainId) continue;
    let c = m.get(r.chainId);
    if (!c) m.set(r.chainId, (c = []));
    c.push(r);
  }
  const chains = [];
  for (const hops of m.values()) {
    hops.sort((a, b) => a.hop - b.hop || a.start - b.start);
    chains.push(hops);
  }
  return chains.sort((a, b) => b[0].start - a[0].start); // newest first
}

// The chain a single request belongs to (for the details pane).
function chainFor(r) {
  if (!r.chainId) return null;
  const hops = [...records.values()].filter((x) => x.chainId === r.chainId);
  return hops.sort((a, b) => a.hop - b.hop || a.start - b.start);
}

// One line saying why a hop moved on.
function hopReason(r) {
  if (r.internal) {
    return /^http:/i.test(r.url) && /^https:/i.test(r.redirectTo || "")
      ? "The browser itself switched this to a secure (HTTPS) address. No server was asked."
      : "The browser itself sent this on (an internal redirect, for example by another extension or a security rule).";
  }
  return STATUS_EXPLAIN[r.status] || `The server answered ${r.status} and sent the browser to a new address.`;
}

function frameLabel(r) {
  if (r.tabId === -1) return "not in a tab";
  if (r.frameId === 0 || r.frameId === undefined) return "the tab's main page";
  return "an embedded frame (iframe) inside the page";
}

// How a page load in a tab got started.
function pageOrigin(r) {
  if (r.hop > 0) return `Redirected here from ${hostOfUrl(r.redirectFrom) || r.redirectFrom}`;
  if (!r.initiator) return "You opened it (typed address, bookmark, reload or a new tab)";
  return `Started by ${hostOfUrl(r.initiator) || r.initiator} (a link, form or script on that page)`;
}

function renderTabs(all) {
  const byTab = new Map();
  for (const r of all) {
    let g = byTab.get(r.tabId);
    if (!g) byTab.set(r.tabId, (g = []));
    g.push(r);
  }

  // Every open tab, plus closed or unknown tabs that still have recorded activity.
  const ids = new Set();
  for (const t of tabInfo.values()) if (!t.closedAt || byTab.has(t.id)) ids.add(t.id);
  for (const id of byTab.keys()) ids.add(id);

  const q = els.search.value.trim().toLowerCase();
  const entries = [...ids].map((id) => {
    const list = byTab.get(id) || [];
    const t = tabInfo.get(id);
    return { id, t, list, last: list.reduce((m, r) => Math.max(m, r.start), 0) };
  }).filter((e) => {
    if (!q) return true;
    const text = [tabLabel(e.id), e.t ? e.t.url : "", ...e.list.map((r) => r.host)].join(" ").toLowerCase();
    return text.includes(q);
  }).sort((a, b) =>
    (b.id === currentTabId) - (a.id === currentTabId) ||
    (a.id === -1) - (b.id === -1) ||
    !!(a.t && a.t.closedAt) - !!(b.t && b.t.closedAt) ||
    b.last - a.last);

  const frag = document.createDocumentFragment();
  for (const e of entries) frag.append(tabCard(e));
  els.tabCards.replaceChildren(frag);

  els.tabsEmpty.hidden = entries.length > 0;
  els.tabsEmpty.textContent = q ? "No tabs match." : "No tabs yet.";
  const open = [...tabInfo.values()].filter((t) => !t.closedAt).length;
  const chains = chainsOf(all).length;
  els.footerText.textContent = `${open} open tabs · ${chains} redirect chain${chains === 1 ? "" : "s"} recorded`;
}

function tabCard({ id, t, list }) {
  const isOpen = expandedTabs.has(id) || (id === currentTabId && !collapsedTabs.has(id));
  const card = document.createElement("div");
  card.className = "tab-card" + (isOpen ? " open" : "") + (t && t.closedAt ? " closed" : "");
  card.dataset.tab = id;

  // Header: icon, title, address, badges.
  const head = document.createElement("div");
  head.className = "tab-head";
  head.dataset.toggle = id;
  head.title = isOpen ? "Hide details" : "Show this tab's pages and redirects";
  const caret = el("span", "caret", isOpen ? "▾" : "▸");
  const icon = document.createElement("img");
  icon.className = "favicon";
  icon.alt = "";
  const fav = t && t.favIconUrl;
  if (fav && /^(https?|data):/i.test(fav)) {
    icon.src = fav;
    icon.referrerPolicy = "no-referrer";
    icon.addEventListener("error", () => icon.classList.add("none"));
  } else icon.classList.add("none");
  const text = document.createElement("div");
  text.className = "tab-text";
  const title = el("div", "tab-title", tabLabel(id));
  if (id === currentTabId) title.append(el("span", "tag cur", "this tab"));
  if (t && t.closedAt) title.append(el("span", "tag muted", "closed"));
  const addr = el("div", "path", id === -1 ? "Requests made by the browser or extensions, not by a web page" : (t ? t.url : "Details for this tab are not available"));
  text.append(title, addr);
  head.append(caret, icon, text);
  card.append(head);

  // Numbers.
  const chains = chainsOf(list);
  const sites = new Set(list.map((r) => r.site)).size;
  const third = list.filter((r) => r.thirdParty).length;
  card.append(el("div", "tab-stats",
    `${list.length} request${list.length === 1 ? "" : "s"} · ${sites} site${sites === 1 ? "" : "s"} · ${third} third-party · ${chains.length} redirect chain${chains.length === 1 ? "" : "s"}`));

  if (t && t.openerTabId !== undefined && t.openerTabId !== null) {
    const op = el("div", "tab-opener", "Opened from: ");
    const link = el("a", "link", tabLabel(t.openerTabId));
    link.href = "#";
    link.dataset.expand = t.openerTabId;
    link.title = "The tab that opened this one (a link, pop-up or script)";
    op.append(link);
    card.append(op);
  }

  if (!isOpen) return card;

  // Actions.
  const actions = el("div", "tab-actions");
  const show = el("button", "", "Show its requests");
  show.dataset.showTab = id;
  actions.append(show);
  if (t && !t.closedAt) {
    const go = el("button", "", "Go to tab");
    go.dataset.goTab = id;
    actions.append(go);
  }
  card.append(actions);

  // Pages opened in this tab, in order.
  const pages = list.filter((r) => r.type === "main_frame" && !(r.state === "redirect")).sort((a, b) => a.start - b.start);
  if (pages.length) {
    card.append(el("h4", "", "Pages opened in this tab"));
    const ol = el("ol", "page-list");
    const shown = pages.slice(-MAX_PAGES_PER_TAB);
    if (pages.length > shown.length) ol.start = pages.length - shown.length + 1;
    for (const r of shown) {
      const li = el("li", "link");
      li.dataset.req = r.id;
      li.title = r.url;
      li.append(el("span", "hop-url", r.url), el("span", "explain", `${clock(r.start)} · ${pageOrigin(r)}`));
      ol.append(li);
    }
    card.append(ol);
  }

  // Redirect chains.
  card.append(el("h4", "", "Redirects"));
  if (!chains.length) {
    card.append(el("p", "explain", "No redirects recorded in this tab. A redirect is when a server (or the browser) answers \"go to this other address instead\"."));
    return card;
  }
  for (const hops of chains.slice(0, MAX_CHAINS_PER_TAB)) card.append(chainBlock(hops));
  if (chains.length > MAX_CHAINS_PER_TAB) {
    card.append(el("p", "explain", `Showing the newest ${MAX_CHAINS_PER_TAB} of ${chains.length} redirect chains. Use Show its requests and the "Redirected" filter to see them all.`));
  }
  return card;
}

// A redirect chain: where it started, every hop, where it ended up.
function chainBlock(hops) {
  const first = hops[0];
  const last = hops[hops.length - 1];
  const box = el("div", "chain");

  const sitesInChain = new Set(hops.map((r) => r.site));
  const head = el("div", "chain-head");
  head.append(el("b", "", kindOf(first.type).label));
  head.append(document.createTextNode(` · ${clock(first.start)} · ${hops.length - 1} redirect${hops.length === 2 ? "" : "s"}`));
  if (sitesInChain.size > 1) {
    head.append(el("span", "tag third", `crosses ${sitesInChain.size} sites`));
  }
  box.append(head);
  box.append(el("div", "explain",
    `In ${frameLabel(first)}. Asked for by ${first.initiator ? (hostOfUrl(first.initiator) || first.initiator) : "you (by opening the page)"}.`));

  const ol = el("ol", "hops");
  hops.forEach((r, i) => {
    const li = el("li", "hop link");
    li.dataset.req = r.id;
    li.title = "Show the details of this step";
    const label = i === 0 ? "Started at" : (r === last && r.state !== "redirect" ? "Ended at" : "Then");
    const top = el("div", "hop-top");
    top.append(el("span", "hop-label", label), el("span", "hop-url", r.url));
    li.append(top);
    if (r.state === "redirect") {
      const why = el("div", "hop-why");
      const code = r.internal ? "Browser" : String(r.status);
      why.append(el("span", "st-redirect", `↳ ${code}`), document.createTextNode(" " + hopReason(r)));
      const next = hops[i + 1];
      if (next && next.site !== r.site) why.append(el("span", "tag third", "to another site"));
      li.append(why);
    } else {
      const res = resultOf(r);
      const why = el("div", "hop-why");
      why.append(el("span", "st-" + res.key, res.label),
        document.createTextNode(" " + (r.error ? (ERRORS[r.error] || r.error) : (r.state === "pending" ? "Still loading." : (STATUS_EXPLAIN[r.status] || "")))));
      li.append(why);
    }
    ol.append(li);
  });
  // The last hop said "go elsewhere" but the next step was not seen (for example it was blocked or the page was closed).
  if (last.state === "redirect") {
    const li = el("li", "hop");
    li.append(el("div", "hop-top", ""), el("div", "explain", `Sent on to ${last.redirectTo}, but that step was not recorded (it may have been blocked, cancelled or still starting).`));
    ol.append(li);
  }
  box.append(ol);
  return box;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// Clicks inside the Tabs view.
function onTabsClick(e) {
  const req = e.target.closest("[data-req]");
  if (req && records.has(req.dataset.req)) {
    els.search.value = "";
    setView("requests");
    showDetails(records.get(req.dataset.req));
    return;
  }
  const exp = e.target.closest("[data-expand]");
  if (exp) {
    e.preventDefault();
    const id = +exp.dataset.expand;
    expandedTabs.add(id); collapsedTabs.delete(id);
    queueRender();
    requestAnimationFrame(() => {
      const card = els.tabCards.querySelector(`.tab-card[data-tab="${id}"]`);
      if (card) card.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return;
  }
  const show = e.target.closest("[data-show-tab]");
  if (show) {
    showTabRequests(+show.dataset.showTab);
    return;
  }
  const go = e.target.closest("[data-go-tab]");
  if (go) {
    const t = tabInfo.get(+go.dataset.goTab);
    if (t) {
      chrome.tabs.update(t.id, { active: true }).catch(() => {});
      chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
    }
    return;
  }
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) {
    const id = +toggle.dataset.toggle;
    const isOpen = expandedTabs.has(id) || (id === currentTabId && !collapsedTabs.has(id));
    if (isOpen) { expandedTabs.delete(id); collapsedTabs.add(id); }
    else { expandedTabs.add(id); collapsedTabs.delete(id); }
    queueRender();
  }
}
