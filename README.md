# Network Monitor

A browser extension that shows, in plain language, every network request your browser makes: what it asked for (outgoing), what came back (incoming), which sites were contacted, and which of them were third parties such as ads and analytics.

It runs in **Microsoft Edge** and **Google Chrome** from the same files. It only uses standard `chrome.*` extension APIs (Manifest V3, `webRequest`, `sidePanel`, `storage`, `tabs`), nothing Edge-specific.

## Install it (unpacked)

### Microsoft Edge
1. Open `edge://extensions`.
2. Turn on **Developer mode** (bottom-left toggle).
3. Click **Load unpacked** and choose the `network-monitor` folder (the one that contains `manifest.json`).
4. Click the puzzle-piece icon in the toolbar and pin **Network Monitor**.

### Google Chrome
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and choose the `network-monitor` folder.
4. Pin it from the puzzle-piece menu.

Requires Edge or Chrome version 116 or newer.

## Use it
- Click the toolbar icon to open the side panel.
- Load or refresh any web page. Requests appear live, newest at the top.
- The four boxes at the top summarise what you're looking at: total requests, number of different sites contacted, how many went to third parties, and how many failed.
- **Filters**: search by address, show only this tab or all tabs, filter by kind (script, image, tracking ping...), by result (OK, redirected, errors, failed), by site, or third-party only.
- **Click a row** for details, with a short explanation of each field (what the status code means, why something failed, what the request type is).
- **Pause** stops recording, **Clear** erases the log.
- **Export** saves exactly what the current filters show, as CSV (opens in Excel) or JSON.
- "What am I looking at?" in the footer gives a quick primer.

## Privacy
The extension only observes. It doesn't block or change requests, and it never sends anything anywhere. The log is kept in the browser's session storage and is erased when the browser closes or when you press Clear. Requests made by the extension itself are ignored.

## Limits worth knowing
- Browser extensions can't see request or response **contents** (bodies), so the panel shows addresses, methods, status codes, sizes, timing and server IPs, not the data itself.
- Requests from other extensions, and from internal pages like `edge://` and `chrome://`, are mostly hidden from extensions by the browser.
- The log keeps the most recent 5,000 requests. The table draws the newest 500 that match your filters. Export always includes every match.
- "Third-party" is decided by comparing the site of the request with the site of the page that made it (for example `news.example.com` → `cdn.tracker.com`). It uses a simple rule for domain names rather than a full public-suffix list, so a few unusual domains may be misjudged.
- Size comes from the server's `Content-Length` header and is blank when the server doesn't send it.

## Files
| File | What it does |
| --- | --- |
| `manifest.json` | Extension settings and permissions |
| `background.js` | Records requests with `chrome.webRequest` and keeps the log |
| `sidepanel.html` / `.css` / `.js` | The side panel UI: table, filters, details, export |
| `icons/` | Toolbar and store icons |

## Publishing later
The same folder can be zipped and uploaded to both the Microsoft Edge Add-ons store and the Chrome Web Store. The stores will ask you to justify the `<all_urls>` host permission; the honest answer is "to display all network requests the user's browser makes, locally, without modifying them."
