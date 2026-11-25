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
- **Tabs view**: traces activity back to the tab it came from. Every open tab is listed by title, icon and address (closed tabs stay listed while their activity is in the log), with its request, site, third-party and redirect counts, and which tab opened it. Open a tab card to see:
  - **Pages opened in this tab**, in order, and how each one started (you opened it, a link or script on another site, or a redirect).
  - **Redirects**: each redirect chain from start to finish. Every hop shows its address, the status code (301, 302, 307...) with a plain explanation, whether it jumped to another site, and the final result. It also says whether the chain ran in the main page or an embedded frame, and who asked for it. Redirects the browser does itself (such as upgrading to HTTPS) are labelled as such.
  - **Show its requests** filters the Requests view to that tab, and **Go to tab** switches to it. You can also pick any tab by name from the "Which tabs" menu.
- In the Requests view, rows that arrived by redirect are tagged **↪ redirected**, and when you look at all tabs each row says which tab it came from. A request's details show its tab, frame, the page it was on, where it was redirected from and to, and the whole chain.
- **Sites tab**: lists every site the page contacted, how many requests went to it, and what it is probably for (website you're on, advertising, analytics, social media, content delivery, fonts, cookie consent, payments and more). Purposes come from a built-in list of about 340 well-known services. For anything not on the list, the panel makes a **best guess** from the address (for example `cdn.` or `/collect`) and the kind of traffic (tracking pings, tiny images, video, background data) and says why. Use the coloured chips to show one category, and click a site to jump to its requests.
- **Summary tab**: totals for the traffic you're looking at (this tab or all tabs):
  - **Data in and out**: how much was sent and received, split into headers and content, broken down by kind of content and by site.
  - **Cookies**: how many requests carried cookies and how much cookie data was sent, first-party vs third-party, how many cookies servers asked to set (session cookies vs ones kept after closing, and deletions), cookies missing the Secure or HttpOnly flags, and a per-site table. Only cookie **names and sizes** are recorded, never their values.
  - **Other things worth knowing**: how much traffic was encrypted (HTTPS), the third-party share of requests and data, requests to ads/analytics/social sites, typical response time, failures and redirects, plus the biggest and slowest requests. Click any of them to see its details.
- Each site card on the Sites tab also shows data received and sent, and cookies sent and set.
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
- Redirect chains are linked using the browser's request id, which stays the same across HTTP redirects. Redirects done by page scripts or `<meta refresh>` start a brand-new request, so they appear as a new page in the tab's page list rather than as a chain.
- "Third-party" is decided by comparing the site of the request with the site of the page that made it (for example `news.example.com` → `cdn.tracker.com`). It uses a simple rule for domain names rather than a full public-suffix list, so a few unusual domains may be misjudged.
- Site purposes are offline guesses. The extension does not read page or response contents (that would need the `debugger` permission, which shows a warning banner and makes store approval harder). Known services are reliable; "best guess" labels are hints. To teach it a new service, add a line to `KNOWN_SITES` in `sites.js`.
- Size comes from the server's `Content-Length` header and is blank when the server doesn't send it. Totals on the Summary tab mark this with "at least" and say how many responses didn't report a size.
- Header sizes are **estimates** made from the header text. HTTP/2 and HTTP/3 compress headers, so the real bytes on the wire are usually a bit smaller. Upload sizes are measured from the request body; a file upload's size can't be seen by extensions.
- Cookies are read from the `Cookie` and `Set-Cookie` headers (Chrome and Edge only show these to extensions that ask for `extraHeaders`, which is a listener option, not a permission). "Set" means a server asked to set the cookie; tracking prevention may still block third-party cookies. Cookies created by page scripts appear once they are sent with a request.

## Files
| File | What it does |
| --- | --- |
| `manifest.json` | Extension settings and permissions |
| `background.js` | Records requests with `chrome.webRequest` and keeps the log |
| `sidepanel.html` / `.css` / `.js` | The side panel UI: requests table, Sites tab, filters, details, export |
| `tabs.js` | The Tabs view: activity per tab, pages loaded, and redirect chains |
| `summary.js` | The Summary tab: data totals, cookies and other insights |
| `sites.js` | Built-in list of known services and the rules that guess what each site is for |
| `icons/` | Toolbar and store icons |

## Publishing later
The same folder can be zipped and uploaded to both the Microsoft Edge Add-ons store and the Chrome Web Store. The stores will ask you to justify the `<all_urls>` host permission; the honest answer is "to display all network requests the user's browser makes, locally, without modifying them."
