// Network Monitor - "what is this site for?" guesses.
// Explains each contacted site in plain language using:
//   1. a built-in list of well-known services (below), then
//   2. clues in the address (e.g. "cdn.", "analytics.", "/collect"), then
//   3. the kind of traffic it sent (pings, tiny images, video, background data).
// Nothing is looked up online and no page or response contents are read.
// Plain script (no modules) so it loads the same way in Edge and Chrome.

const SITE_CATEGORIES = {
  self:       { label: "Website you're on", explain: "The site you are visiting. It sends the page itself and many of its own files." },
  related:    { label: "Same company (likely)", explain: "Its name looks like the site you're visiting, so it is probably that company's own helper domain for images, scripts or data." },
  ads:        { label: "Advertising", explain: "Shows ads, and often follows you across sites to decide which ads to show you." },
  analytics:  { label: "Analytics & tracking", explain: "Measures what visitors do (page views, clicks, scrolling). The data usually goes to the analytics company too." },
  tagmanager: { label: "Tag manager", explain: "Loads other scripts chosen by the site owner, usually analytics and advertising." },
  social:     { label: "Social media", explain: "Social buttons, embedded posts, pixels or login. These can tell the social network which pages you visit." },
  cdn:        { label: "Content delivery (CDN)", explain: "Delivers files such as scripts, images and styles from servers near you so pages load faster. Usually harmless." },
  fonts:      { label: "Fonts", explain: "Provides the typefaces used to display text." },
  media:      { label: "Video & media", explain: "Streams video or audio, or serves images and media." },
  embed:      { label: "Embedded content", explain: "A page or widget shown inside this page, such as a player, a form or an ad slot." },
  live:       { label: "Live updates", explain: "Keeps an open connection for live updates such as chat, notifications or prices." },
  auth:       { label: "Sign-in & accounts", explain: "Handles logging in and user accounts." },
  payments:   { label: "Payments", explain: "Processes payments, checkout or buy-now-pay-later offers." },
  support:    { label: "Chat & support", explain: "Customer support chat, help widgets, surveys or feedback forms." },
  security:   { label: "Security & bot checks", explain: "Protects the site from bots, fraud and attacks, for example CAPTCHAs." },
  consent:    { label: "Cookie consent", explain: "Shows the cookie banner and remembers your privacy choices." },
  monitoring: { label: "Error & speed monitoring", explain: "Reports errors and page speed back to the site's developers." },
  maps:       { label: "Maps", explain: "Shows maps or looks up locations." },
  api:        { label: "Data / API", explain: "A service the page talks to in the background to fetch or send data." },
  cloud:      { label: "Cloud hosting", explain: "A cloud provider hosting files or services. The real owner is whichever site uses it." },
  search:     { label: "Search & web services", explain: "A search engine or a big provider's general web services." },
  browser:    { label: "Browser services", explain: "Traffic from the browser itself (updates, safety checks, sync, new-tab page), not from a web page." },
  unknown:    { label: "Unknown", explain: "Not in the built-in list, and nothing in its address or traffic gives a clear hint." }
};

// Categories that usually involve following what you do.
const TRACKING_CATEGORIES = new Set(["ads", "analytics", "tagmanager", "social"]);

// domain (or a specific host) -> [category, owner, product name]
// The most specific match wins, so "fonts.googleapis.com" beats "googleapis.com".
const KNOWN_SITES = {
  // Advertising
  "doubleclick.net": ["ads", "Google", "Google Ads / DoubleClick"],
  "googlesyndication.com": ["ads", "Google", "Google AdSense"],
  "googleadservices.com": ["ads", "Google", "Google Ads conversion tracking"],
  "adservice.google.com": ["ads", "Google", "Google Ads"],
  "pagead2.googlesyndication.com": ["ads", "Google", "Google AdSense"],
  "2mdn.net": ["ads", "Google", "Google ad media"],
  "googletagservices.com": ["ads", "Google", "Google Ad Manager"],
  "adnxs.com": ["ads", "Microsoft", "Xandr ad exchange"],
  "criteo.com": ["ads", "Criteo", "Retargeting ads"],
  "criteo.net": ["ads", "Criteo", "Retargeting ads"],
  "taboola.com": ["ads", "Taboola", "Sponsored content"],
  "outbrain.com": ["ads", "Outbrain", "Sponsored content"],
  "zemanta.com": ["ads", "Outbrain", "Ad platform"],
  "amazon-adsystem.com": ["ads", "Amazon", "Amazon Ads"],
  "adsrvr.org": ["ads", "The Trade Desk", "Ad buying platform"],
  "rubiconproject.com": ["ads", "Magnite", "Ad exchange"],
  "pubmatic.com": ["ads", "PubMatic", "Ad exchange"],
  "openx.net": ["ads", "OpenX", "Ad exchange"],
  "casalemedia.com": ["ads", "Index Exchange", "Ad exchange"],
  "indexww.com": ["ads", "Index Exchange", "Ad exchange"],
  "smartadserver.com": ["ads", "Equativ", "Ad server"],
  "adform.net": ["ads", "Adform", "Ad platform"],
  "media.net": ["ads", "Media.net", "Contextual ads"],
  "bidswitch.net": ["ads", "IPONWEB", "Ad exchange"],
  "3lift.com": ["ads", "TripleLift", "Native ads"],
  "sharethrough.com": ["ads", "Sharethrough", "Native ads"],
  "teads.tv": ["ads", "Teads", "Video ads"],
  "yieldmo.com": ["ads", "Yieldmo", "Mobile ads"],
  "lijit.com": ["ads", "Sovrn", "Ad exchange"],
  "contextweb.com": ["ads", "PulsePoint", "Ad exchange"],
  "gumgum.com": ["ads", "GumGum", "Contextual ads"],
  "adroll.com": ["ads", "AdRoll", "Retargeting ads"],
  "moatads.com": ["ads", "Oracle", "Ad measurement"],
  "adsafeprotected.com": ["ads", "Integral Ad Science", "Ad verification"],
  "doubleverify.com": ["ads", "DoubleVerify", "Ad verification"],
  "everesttech.net": ["ads", "Adobe", "Adobe Advertising"],
  "bluekai.com": ["ads", "Oracle", "Audience data"],
  "rlcdn.com": ["ads", "LiveRamp", "Identity matching for ads"],
  "agkn.com": ["ads", "Neustar", "Audience data"],
  "mathtag.com": ["ads", "MediaMath", "Ad buying platform"],
  "tapad.com": ["ads", "Tapad", "Cross-device tracking"],
  "id5-sync.com": ["ads", "ID5", "Ad identity"],
  "crwdcntrl.net": ["ads", "Lotame", "Audience data"],
  "exelator.com": ["ads", "Nielsen", "Audience data"],
  "krxd.net": ["ads", "Salesforce", "Audience data"],
  "advertising.com": ["ads", "Yahoo", "Yahoo ads"],
  "ads.yahoo.com": ["ads", "Yahoo", "Yahoo ads"],
  "bat.bing.com": ["ads", "Microsoft", "Microsoft Advertising tracking"],
  "ads-twitter.com": ["ads", "X (Twitter)", "X ads tracking"],
  "ads.linkedin.com": ["ads", "LinkedIn", "LinkedIn ads tracking"],
  "an.yandex.ru": ["ads", "Yandex", "Yandex ads"],
  "serving-sys.com": ["ads", "Amazon", "Ad server"],
  "flashtalking.com": ["ads", "Mediaocean", "Ad server"],
  "quantcount.com": ["analytics", "Quantcast", "Audience measurement"],

  // Analytics & tracking
  "google-analytics.com": ["analytics", "Google", "Google Analytics"],
  "analytics.google.com": ["analytics", "Google", "Google Analytics"],
  "segment.com": ["analytics", "Twilio", "Segment"],
  "segment.io": ["analytics", "Twilio", "Segment"],
  "mixpanel.com": ["analytics", "Mixpanel", "Product analytics"],
  "mxpnl.com": ["analytics", "Mixpanel", "Product analytics"],
  "amplitude.com": ["analytics", "Amplitude", "Product analytics"],
  "heap.io": ["analytics", "Heap", "Product analytics"],
  "heapanalytics.com": ["analytics", "Heap", "Product analytics"],
  "hotjar.com": ["analytics", "Hotjar", "Session recording & heatmaps"],
  "hotjar.io": ["analytics", "Hotjar", "Session recording & heatmaps"],
  "fullstory.com": ["analytics", "FullStory", "Session recording"],
  "clarity.ms": ["analytics", "Microsoft", "Microsoft Clarity (session recording)"],
  "mouseflow.com": ["analytics", "Mouseflow", "Session recording"],
  "crazyegg.com": ["analytics", "Crazy Egg", "Heatmaps"],
  "luckyorange.com": ["analytics", "Lucky Orange", "Session recording"],
  "logrocket.com": ["analytics", "LogRocket", "Session recording"],
  "lr-ingest.io": ["analytics", "LogRocket", "Session recording"],
  "chartbeat.com": ["analytics", "Chartbeat", "Audience analytics"],
  "chartbeat.net": ["analytics", "Chartbeat", "Audience analytics"],
  "parsely.com": ["analytics", "Parse.ly", "Content analytics"],
  "parse.ly": ["analytics", "Parse.ly", "Content analytics"],
  "scorecardresearch.com": ["analytics", "Comscore", "Audience measurement"],
  "quantserve.com": ["analytics", "Quantcast", "Audience measurement"],
  "demdex.net": ["analytics", "Adobe", "Adobe Experience Cloud"],
  "omtrdc.net": ["analytics", "Adobe", "Adobe Analytics"],
  "2o7.net": ["analytics", "Adobe", "Adobe Analytics"],
  "statcounter.com": ["analytics", "StatCounter", "Web analytics"],
  "plausible.io": ["analytics", "Plausible", "Privacy-friendly analytics"],
  "matomo.cloud": ["analytics", "Matomo", "Web analytics"],
  "optimizely.com": ["analytics", "Optimizely", "A/B testing"],
  "visualwebsiteoptimizer.com": ["analytics", "VWO", "A/B testing"],
  "branch.io": ["analytics", "Branch", "Link tracking"],
  "app.link": ["analytics", "Branch", "Link tracking"],
  "appsflyer.com": ["analytics", "AppsFlyer", "Marketing attribution"],
  "adjust.com": ["analytics", "Adjust", "Marketing attribution"],
  "pendo.io": ["analytics", "Pendo", "Product analytics"],
  "kissmetrics.io": ["analytics", "Kissmetrics", "Product analytics"],
  "cloudflareinsights.com": ["analytics", "Cloudflare", "Cloudflare Web Analytics"],
  "hs-analytics.net": ["analytics", "HubSpot", "Marketing analytics"],
  "hs-scripts.com": ["analytics", "HubSpot", "Marketing tools"],
  "hscollectedforms.net": ["analytics", "HubSpot", "Form tracking"],
  "hsforms.com": ["support", "HubSpot", "Forms"],
  "hubspot.com": ["analytics", "HubSpot", "Marketing platform"],
  "marketo.net": ["analytics", "Adobe", "Marketo marketing tracking"],
  "mktoresp.com": ["analytics", "Adobe", "Marketo marketing tracking"],
  "pardot.com": ["analytics", "Salesforce", "Marketing tracking"],
  "braze.com": ["analytics", "Braze", "Customer messaging"],
  "onesignal.com": ["analytics", "OneSignal", "Push notifications"],
  "mc.yandex.ru": ["analytics", "Yandex", "Yandex Metrica"],
  "analytics.tiktok.com": ["analytics", "TikTok", "TikTok Pixel"],
  "ct.pinterest.com": ["analytics", "Pinterest", "Pinterest Tag"],
  "sc-static.net": ["analytics", "Snap", "Snap Pixel"],
  "px.ads.linkedin.com": ["analytics", "LinkedIn", "LinkedIn Insight Tag"],
  "snap.licdn.com": ["analytics", "LinkedIn", "LinkedIn Insight Tag"],
  "c.bing.com": ["analytics", "Microsoft", "Bing tracking"],
  "c.clarity.ms": ["analytics", "Microsoft", "Microsoft Clarity"],

  // Tag managers
  "googletagmanager.com": ["tagmanager", "Google", "Google Tag Manager"],
  "tiqcdn.com": ["tagmanager", "Tealium", "Tealium tag manager"],
  "tealiumiq.com": ["analytics", "Tealium", "Tealium data collection"],
  "ensighten.com": ["tagmanager", "Ensighten", "Tag manager"],
  "adobedtm.com": ["tagmanager", "Adobe", "Adobe Launch tag manager"],

  // Social media
  "facebook.com": ["social", "Meta", "Facebook"],
  "facebook.net": ["social", "Meta", "Facebook SDK / Meta Pixel"],
  "connect.facebook.net": ["social", "Meta", "Facebook SDK / Meta Pixel"],
  "fbcdn.net": ["social", "Meta", "Facebook images & files"],
  "instagram.com": ["social", "Meta", "Instagram"],
  "cdninstagram.com": ["social", "Meta", "Instagram images"],
  "whatsapp.com": ["social", "Meta", "WhatsApp"],
  "twitter.com": ["social", "X (Twitter)", "X / Twitter"],
  "x.com": ["social", "X (Twitter)", "X / Twitter"],
  "twimg.com": ["social", "X (Twitter)", "X images & files"],
  "t.co": ["social", "X (Twitter)", "X link shortener"],
  "linkedin.com": ["social", "LinkedIn", "LinkedIn"],
  "licdn.com": ["social", "LinkedIn", "LinkedIn files"],
  "pinterest.com": ["social", "Pinterest", "Pinterest"],
  "pinimg.com": ["social", "Pinterest", "Pinterest images"],
  "tiktok.com": ["social", "TikTok", "TikTok"],
  "tiktokcdn.com": ["social", "TikTok", "TikTok files"],
  "reddit.com": ["social", "Reddit", "Reddit"],
  "redditstatic.com": ["social", "Reddit", "Reddit files"],
  "redditmedia.com": ["social", "Reddit", "Reddit media"],
  "snapchat.com": ["social", "Snap", "Snapchat"],
  "tumblr.com": ["social", "Automattic", "Tumblr"],
  "discord.com": ["social", "Discord", "Discord"],
  "addthis.com": ["social", "Oracle", "Share buttons"],
  "sharethis.com": ["social", "ShareThis", "Share buttons"],
  "disqus.com": ["social", "Disqus", "Comments"],
  "disquscdn.com": ["social", "Disqus", "Comments"],

  // CDNs and file hosting
  "cloudflare.com": ["cdn", "Cloudflare", "Cloudflare"],
  "cdnjs.cloudflare.com": ["cdn", "Cloudflare", "cdnjs code library"],
  "jsdelivr.net": ["cdn", "jsDelivr", "Open-source code CDN"],
  "unpkg.com": ["cdn", "unpkg", "Open-source code CDN"],
  "bootstrapcdn.com": ["cdn", "BootstrapCDN", "Code library CDN"],
  "code.jquery.com": ["cdn", "jQuery", "jQuery library"],
  "ajax.googleapis.com": ["cdn", "Google", "Hosted code libraries"],
  "gstatic.com": ["cdn", "Google", "Google static files"],
  "akamaihd.net": ["cdn", "Akamai", "Akamai CDN"],
  "akamaized.net": ["cdn", "Akamai", "Akamai CDN"],
  "akamai.net": ["cdn", "Akamai", "Akamai CDN"],
  "edgekey.net": ["cdn", "Akamai", "Akamai CDN"],
  "edgesuite.net": ["cdn", "Akamai", "Akamai CDN"],
  "akamaiedge.net": ["cdn", "Akamai", "Akamai CDN"],
  "fastly.net": ["cdn", "Fastly", "Fastly CDN"],
  "fastly.com": ["cdn", "Fastly", "Fastly CDN"],
  "cloudfront.net": ["cdn", "Amazon", "Amazon CloudFront CDN"],
  "azureedge.net": ["cdn", "Microsoft", "Azure CDN"],
  "azurefd.net": ["cdn", "Microsoft", "Azure Front Door CDN"],
  "b-cdn.net": ["cdn", "Bunny.net", "Bunny CDN"],
  "stackpathcdn.com": ["cdn", "StackPath", "StackPath CDN"],
  "imgix.net": ["cdn", "imgix", "Image CDN"],
  "cloudinary.com": ["cdn", "Cloudinary", "Image & video CDN"],
  "wp.com": ["cdn", "Automattic", "WordPress.com files"],
  "wordpress.com": ["cloud", "Automattic", "WordPress.com"],
  "squarespace.com": ["cloud", "Squarespace", "Website builder"],
  "squarespace-cdn.com": ["cdn", "Squarespace", "Website builder files"],
  "wixstatic.com": ["cdn", "Wix", "Website builder files"],
  "parastorage.com": ["cdn", "Wix", "Website builder files"],
  "wix.com": ["cloud", "Wix", "Website builder"],
  "website-files.com": ["cdn", "Webflow", "Website builder files"],
  "shopify.com": ["cloud", "Shopify", "Online store platform"],
  "shopifycdn.com": ["cdn", "Shopify", "Online store files"],

  // Fonts
  "fonts.googleapis.com": ["fonts", "Google", "Google Fonts"],
  "fonts.gstatic.com": ["fonts", "Google", "Google Fonts"],
  "typekit.net": ["fonts", "Adobe", "Adobe Fonts"],
  "typekit.com": ["fonts", "Adobe", "Adobe Fonts"],
  "fontawesome.com": ["fonts", "Fonticons", "Font Awesome icons"],
  "fonts.com": ["fonts", "Monotype", "Fonts.com"],
  "typography.com": ["fonts", "Monotype", "Hoefler&Co fonts"],
  "fonts.net": ["fonts", "Monotype", "Fonts"],

  // Video & media
  "youtube.com": ["media", "Google", "YouTube"],
  "youtube-nocookie.com": ["media", "Google", "YouTube (privacy mode)"],
  "ytimg.com": ["media", "Google", "YouTube images"],
  "googlevideo.com": ["media", "Google", "YouTube video streams"],
  "vimeo.com": ["media", "Vimeo", "Vimeo video"],
  "vimeocdn.com": ["media", "Vimeo", "Vimeo video"],
  "jwplayer.com": ["media", "JW Player", "Video player"],
  "jwpcdn.com": ["media", "JW Player", "Video player"],
  "jwpsrv.com": ["media", "JW Player", "Video player"],
  "brightcove.net": ["media", "Brightcove", "Video player"],
  "brightcove.com": ["media", "Brightcove", "Video player"],
  "wistia.com": ["media", "Wistia", "Video hosting"],
  "wistia.net": ["media", "Wistia", "Video hosting"],
  "twitch.tv": ["media", "Amazon", "Twitch"],
  "ttvnw.net": ["media", "Amazon", "Twitch video"],
  "spotify.com": ["media", "Spotify", "Spotify"],
  "scdn.co": ["media", "Spotify", "Spotify files"],
  "soundcloud.com": ["media", "SoundCloud", "SoundCloud"],
  "sndcdn.com": ["media", "SoundCloud", "SoundCloud files"],
  "nflxvideo.net": ["media", "Netflix", "Netflix video"],
  "nflximg.net": ["media", "Netflix", "Netflix images"],
  "giphy.com": ["media", "Giphy", "GIFs"],
  "imgur.com": ["media", "Imgur", "Image hosting"],
  "staticflickr.com": ["media", "Flickr", "Flickr images"],

  // Sign-in
  "accounts.google.com": ["auth", "Google", "Google sign-in"],
  "identitytoolkit.googleapis.com": ["auth", "Google", "Firebase sign-in"],
  "securetoken.googleapis.com": ["auth", "Google", "Firebase sign-in"],
  "login.microsoftonline.com": ["auth", "Microsoft", "Microsoft sign-in"],
  "login.live.com": ["auth", "Microsoft", "Microsoft account sign-in"],
  "appleid.apple.com": ["auth", "Apple", "Sign in with Apple"],
  "auth0.com": ["auth", "Okta", "Auth0 sign-in"],
  "okta.com": ["auth", "Okta", "Okta sign-in"],
  "oktacdn.com": ["auth", "Okta", "Okta sign-in"],
  "clerk.com": ["auth", "Clerk", "Sign-in service"],

  // Payments
  "stripe.com": ["payments", "Stripe", "Stripe payments"],
  "stripe.network": ["payments", "Stripe", "Stripe fraud checks"],
  "paypal.com": ["payments", "PayPal", "PayPal"],
  "paypalobjects.com": ["payments", "PayPal", "PayPal files"],
  "braintreegateway.com": ["payments", "PayPal", "Braintree payments"],
  "braintree-api.com": ["payments", "PayPal", "Braintree payments"],
  "adyen.com": ["payments", "Adyen", "Payments"],
  "klarna.com": ["payments", "Klarna", "Buy now, pay later"],
  "klarnaservices.com": ["payments", "Klarna", "Buy now, pay later"],
  "affirm.com": ["payments", "Affirm", "Buy now, pay later"],
  "afterpay.com": ["payments", "Block", "Buy now, pay later"],
  "squareup.com": ["payments", "Block", "Square payments"],
  "pay.google.com": ["payments", "Google", "Google Pay"],
  "checkout.com": ["payments", "Checkout.com", "Payments"],

  // Chat & support
  "intercom.io": ["support", "Intercom", "Support chat"],
  "intercomcdn.com": ["support", "Intercom", "Support chat"],
  "intercomassets.com": ["support", "Intercom", "Support chat"],
  "zendesk.com": ["support", "Zendesk", "Help desk"],
  "zdassets.com": ["support", "Zendesk", "Help desk"],
  "zopim.com": ["support", "Zendesk", "Live chat"],
  "drift.com": ["support", "Salesloft", "Sales chat"],
  "driftt.com": ["support", "Salesloft", "Sales chat"],
  "livechatinc.com": ["support", "LiveChat", "Live chat"],
  "tawk.to": ["support", "tawk.to", "Live chat"],
  "crisp.chat": ["support", "Crisp", "Live chat"],
  "freshdesk.com": ["support", "Freshworks", "Help desk"],
  "freshchat.com": ["support", "Freshworks", "Live chat"],
  "olark.com": ["support", "Olark", "Live chat"],
  "qualtrics.com": ["support", "Qualtrics", "Surveys"],
  "surveymonkey.com": ["support", "SurveyMonkey", "Surveys"],
  "usabilla.com": ["support", "Usabilla", "Feedback"],

  // Security & bot checks
  "recaptcha.net": ["security", "Google", "reCAPTCHA"],
  "hcaptcha.com": ["security", "Intuition Machines", "hCaptcha"],
  "challenges.cloudflare.com": ["security", "Cloudflare", "Cloudflare Turnstile / bot check"],
  "arkoselabs.com": ["security", "Arkose Labs", "Bot protection"],
  "funcaptcha.com": ["security", "Arkose Labs", "Bot protection"],
  "perimeterx.net": ["security", "HUMAN", "Bot protection"],
  "px-cdn.net": ["security", "HUMAN", "Bot protection"],
  "px-cloud.net": ["security", "HUMAN", "Bot protection"],
  "datadome.co": ["security", "DataDome", "Bot protection"],
  "incapsula.com": ["security", "Imperva", "Bot & attack protection"],
  "siftscience.com": ["security", "Sift", "Fraud detection"],
  "sift.com": ["security", "Sift", "Fraud detection"],

  // Cookie consent
  "cookielaw.org": ["consent", "OneTrust", "Cookie banner"],
  "onetrust.com": ["consent", "OneTrust", "Cookie banner"],
  "cookiebot.com": ["consent", "Usercentrics", "Cookie banner"],
  "consensu.org": ["consent", "IAB Europe", "Cookie consent framework"],
  "trustarc.com": ["consent", "TrustArc", "Cookie banner"],
  "truste.com": ["consent", "TrustArc", "Cookie banner"],
  "didomi.io": ["consent", "Didomi", "Cookie banner"],
  "usercentrics.eu": ["consent", "Usercentrics", "Cookie banner"],
  "osano.com": ["consent", "Osano", "Cookie banner"],
  "privacy-mgmt.com": ["consent", "Sourcepoint", "Cookie banner"],
  "cookieyes.com": ["consent", "CookieYes", "Cookie banner"],
  "termly.io": ["consent", "Termly", "Cookie banner"],

  // Error & speed monitoring
  "sentry.io": ["monitoring", "Sentry", "Error reporting"],
  "sentry-cdn.com": ["monitoring", "Sentry", "Error reporting"],
  "nr-data.net": ["monitoring", "New Relic", "Performance monitoring"],
  "newrelic.com": ["monitoring", "New Relic", "Performance monitoring"],
  "bugsnag.com": ["monitoring", "SmartBear", "Error reporting"],
  "datadoghq.com": ["monitoring", "Datadog", "Performance monitoring"],
  "datadoghq-browser-agent.com": ["monitoring", "Datadog", "Performance monitoring"],
  "rollbar.com": ["monitoring", "Rollbar", "Error reporting"],
  "trackjs.com": ["monitoring", "TrackJS", "Error reporting"],
  "raygun.io": ["monitoring", "Raygun", "Error reporting"],
  "akstat.io": ["monitoring", "Akamai", "mPulse speed monitoring"],
  "go-mpulse.net": ["monitoring", "Akamai", "mPulse speed monitoring"],
  "dynatrace.com": ["monitoring", "Dynatrace", "Performance monitoring"],
  "speedcurve.com": ["monitoring", "SpeedCurve", "Speed monitoring"],

  // Maps
  "maps.googleapis.com": ["maps", "Google", "Google Maps"],
  "maps.gstatic.com": ["maps", "Google", "Google Maps"],
  "mapbox.com": ["maps", "Mapbox", "Maps"],
  "arcgis.com": ["maps", "Esri", "ArcGIS maps"],
  "openstreetmap.org": ["maps", "OpenStreetMap", "Open maps"],
  "virtualearth.net": ["maps", "Microsoft", "Bing Maps"],
  "here.com": ["maps", "HERE", "Maps"],

  // Cloud hosting
  "amazonaws.com": ["cloud", "Amazon", "Amazon Web Services"],
  "azurewebsites.net": ["cloud", "Microsoft", "Azure"],
  "windows.net": ["cloud", "Microsoft", "Azure storage"],
  "herokuapp.com": ["cloud", "Salesforce", "Heroku"],
  "vercel.app": ["cloud", "Vercel", "Vercel hosting"],
  "netlify.app": ["cloud", "Netlify", "Netlify hosting"],
  "github.io": ["cloud", "GitHub", "GitHub Pages"],
  "githubusercontent.com": ["cdn", "GitHub", "GitHub files"],
  "firebaseio.com": ["cloud", "Google", "Firebase database"],
  "firebaseapp.com": ["cloud", "Google", "Firebase hosting"],
  "web.app": ["cloud", "Google", "Firebase hosting"],
  "appspot.com": ["cloud", "Google", "Google App Engine"],
  "googleusercontent.com": ["cloud", "Google", "Google-hosted user files"],
  "storage.googleapis.com": ["cloud", "Google", "Google Cloud Storage"],
  "digitaloceanspaces.com": ["cloud", "DigitalOcean", "File storage"],
  "pages.dev": ["cloud", "Cloudflare", "Cloudflare Pages"],
  "workers.dev": ["cloud", "Cloudflare", "Cloudflare Workers"],
  "supabase.co": ["cloud", "Supabase", "Database & backend"],

  // Search & general web services
  "google.com": ["search", "Google", "Google services"],
  "googleapis.com": ["api", "Google", "Google APIs"],
  "bing.com": ["search", "Microsoft", "Bing"],
  "duckduckgo.com": ["search", "DuckDuckGo", "DuckDuckGo"],
  "yahoo.com": ["search", "Yahoo", "Yahoo"],
  "microsoft.com": ["search", "Microsoft", "Microsoft services"],
  "apple.com": ["search", "Apple", "Apple services"],
  "amazon.com": ["search", "Amazon", "Amazon"],
  "msn.com": ["media", "Microsoft", "MSN news & new-tab content"],

  // Browser's own traffic (Edge and Chrome)
  "edge.microsoft.com": ["browser", "Microsoft", "Microsoft Edge services"],
  "msedge.net": ["browser", "Microsoft", "Microsoft Edge services"],
  "edge.activity.windows.com": ["browser", "Microsoft", "Edge activity sync"],
  "ntp.msn.com": ["browser", "Microsoft", "Edge new-tab page"],
  "smartscreen.microsoft.com": ["browser", "Microsoft", "SmartScreen safety check"],
  "smartscreen-prod.microsoft.com": ["browser", "Microsoft", "SmartScreen safety check"],
  "events.data.microsoft.com": ["browser", "Microsoft", "Microsoft diagnostic data"],
  "config.edge.skype.com": ["browser", "Microsoft", "Edge configuration"],
  "msftconnecttest.com": ["browser", "Microsoft", "Internet connection check"],
  "windowsupdate.com": ["browser", "Microsoft", "Windows / Edge updates"],
  "update.googleapis.com": ["browser", "Google", "Chrome updates"],
  "clients2.google.com": ["browser", "Google", "Chrome services"],
  "clients4.google.com": ["browser", "Google", "Chrome services"],
  "clientservices.googleapis.com": ["browser", "Google", "Chrome services"],
  "safebrowsing.googleapis.com": ["browser", "Google", "Safe Browsing check"],
  "optimizationguide-pa.googleapis.com": ["browser", "Google", "Chrome optimization hints"],
  "content-autofill.googleapis.com": ["browser", "Google", "Chrome autofill"],
  "gvt1.com": ["browser", "Google", "Chrome component downloads"],
  "gvt2.com": ["browser", "Google", "Chrome component downloads"]
};

// ---- helpers --------------------------------------------------------------

// Same rough rule as background.js: last two labels, or three for co.uk etc.
const SITE_TWO_PART = /\.(co|com|net|org|gov|edu|ac|ne|or)\.[a-z]{2}$/i;
function siteOfHost(host) {
  if (!host) return "";
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host;
  const parts = host.split(".");
  return parts.slice(-(SITE_TWO_PART.test(host) ? 3 : 2)).join(".");
}

// Most specific known entry for a host: tries a.b.example.com, b.example.com, example.com.
function lookupKnownSite(host) {
  let h = (host || "").toLowerCase();
  while (h.includes(".")) {
    const k = KNOWN_SITES[h];
    if (k) return { cat: k[0], owner: k[1], name: k[2] || "" };
    h = h.slice(h.indexOf(".") + 1);
  }
  return null;
}

// Clues in the sub-domain labels, e.g. "cdn" in cdn.example.com.
const NAME_HINTS = [
  [/^(ad|ads|adserver|adservice|adsrv|adx|pagead|banners?|bidder|prebid|rtb)\d*$/, "ads"],
  [/^(analytics|stats?|metrics?|telemetry|collect(or)?|track(ing|er)?|pixel|beacons?|insights?|events?|logs?|logging|measure(ment)?|tags?|tms|sstm|sgtm)\d*$/, "analytics"],
  [/^(cdn|static|assets?|img|images?|media|cache|files?|content|dl|downloads?|res|resources)\d*$/, "cdn"],
  [/^fonts?\d*$/, "fonts"],
  [/^(auth|login|logon|signin|accounts?|sso|id|identity|oauth|idp)\d*$/, "auth"],
  [/^(api|apis|gql|graphql|rest|gateway|backend)\d*$/, "api"],
  [/^(ws|wss|socket|sockets|realtime|push)\d*$/, "live"],
  [/^(video|videos|vod|hls|player|stream|streaming)\d*$/, "media"],
  [/^(pay|payments?|checkout|billing)\d*$/, "payments"],
  [/^(chat|support|help|helpdesk|feedback|survey)\d*$/, "support"],
  [/^(captcha|challenge|bot|botdetect)\d*$/, "security"],
  [/^(consent|cookies?|cmp)\d*$/, "consent"],
  [/^(maps?|tiles?)\d*$/, "maps"],
  [/^(errors?|sentry|rum|apm)\d*$/, "monitoring"]
];
// Clues inside the main name of the site itself, e.g. "fastcdn.com".
const SITE_WORD_HINTS = [
  [/adserv|adsrv|adtech|advert/, "ads"],
  [/analytic|metric|tracking|tracker|pixel|telemetry/, "analytics"],
  [/cdn|static/, "cdn"],
  [/font/, "fonts"],
  [/captcha/, "security"],
  [/consent|cookie/, "consent"]
];
// Clues in the address path.
const PATH_HINTS = [
  [/\/(collect|pixel|track|tracking|beacon|analytics|log|logs|event|events|impression|imp|hit|ping)(\/|\?|\.|$)|\/(__utm|utm|p|t|b|i)\.gif/i, "analytics"],
  [/\/(pagead|ads?|adserver|adview|gampad|prebid|bid)(\/|\?|$)/i, "ads"],
  [/recaptcha|hcaptcha|turnstile/i, "security"]
];

function guessFromName(host, site) {
  const sub = host.endsWith("." + site) ? host.slice(0, -site.length - 1) : "";
  for (const label of sub.split(/[.\-_]/)) {
    if (!label) continue;
    for (const [re, cat] of NAME_HINTS) if (re.test(label)) return { cat, reason: `its address contains "${label}"` };
  }
  const main = site.split(".")[0];
  for (const [re, cat] of SITE_WORD_HINTS) {
    const m = main.match(re);
    if (m) return { cat, reason: `its name contains "${m[0]}"` };
  }
  return null;
}

function pathOfUrl(url) {
  try { const u = new URL(url); return u.pathname + u.search; } catch (_) { return ""; }
}

// Look at what the site actually sent and received.
function guessFromTraffic(records, thirdParty) {
  const n = records.length;
  if (!n) return null;
  const types = {};
  let tiny = 0, browserOnly = true;
  const pathHits = {};
  for (const r of records) {
    types[r.type] = (types[r.type] || 0) + 1;
    if (r.tabId !== -1) browserOnly = false;
    if ((r.type === "image" || r.type === "ping" || r.type === "xmlhttprequest") &&
        (r.status === 204 || (r.size != null && r.size <= 100))) tiny++;
    const p = pathOfUrl(r.url);
    for (const [re, cat] of PATH_HINTS) if (re.test(p)) { pathHits[cat] = (pathHits[cat] || 0) + 1; break; }
  }
  const share = (...ts) => ts.reduce((s, t) => s + (types[t] || 0), 0) / n;

  if (browserOnly) return { cat: "browser", reason: "every request came from the browser itself, not a web page" };
  for (const [cat, c] of Object.entries(pathHits)) {
    if (c / n >= 0.3) return { cat, reason: cat === "analytics"
      ? "its addresses look like tracking calls (e.g. /collect, /pixel, /event)"
      : cat === "ads" ? "its addresses look like ad requests" : "its addresses mention a CAPTCHA" };
  }
  if (share("ping") >= 0.3) return { cat: "analytics", reason: "much of its traffic is tracking pings" };
  if (thirdParty && n >= 2 && tiny / n >= 0.5) return { cat: "analytics", reason: "it mostly returns tiny or empty responses, a typical tracking-pixel pattern" };
  if (types.websocket) return { cat: "live", reason: "it keeps a live two-way connection open" };
  if (share("media") >= 0.3) return { cat: "media", reason: "it mostly sends audio or video" };
  if (share("sub_frame") >= 0.3) return { cat: "embed", reason: "it shows content inside the page (an iframe)" };
  if (share("font") >= 0.5) return { cat: "fonts", reason: "it mostly sends font files" };
  if (share("xmlhttprequest") >= 0.6) return { cat: "api", reason: "most requests are background data calls made by scripts" };
  if (thirdParty && share("image", "stylesheet", "script", "font") >= 0.8)
    return { cat: "cdn", reason: "it only delivers files such as scripts, images and styles" };
  return null;
}

// Is `site` probably the same company as one of the pages being visited?
// e.g. bbc.co.uk -> bbci.co.uk, example.com -> example-static.net
function relatedPageSite(site, pageSites) {
  const a = site.split(".")[0];
  for (const p of pageSites) {
    const b = p.split(".")[0];
    if (a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)))) return p;
  }
  return null;
}

// Classify a single host by name only (used for the per-host breakdown).
function classifyHost(host) {
  const known = lookupKnownSite(host);
  if (known) return known.cat;
  const g = guessFromName(host, siteOfHost(host));
  return g ? g.cat : null;
}

// Main entry: what is `site` for?
//   records:   every request that went to this site
//   pageSites: Set of the sites of the pages being viewed
// Returns { cat, owner, name, how: "self"|"known"|"guess"|"none", reason }
function classifySite(site, records, pageSites) {
  // Pick the busiest host so e.g. fonts.googleapis.com decides for googleapis.com.
  const hostCounts = new Map();
  for (const r of records) hostCounts.set(r.host, (hostCounts.get(r.host) || 0) + 1);
  const hosts = [...hostCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topHost = hosts.length ? hosts[0][0] : site;

  const known = lookupKnownSite(topHost) || lookupKnownSite(site);
  if (pageSites.has(site)) {
    return { cat: "self", owner: known ? known.owner : "", name: known ? known.name : "", how: "self", reason: "", hosts };
  }
  if (known) return { ...known, how: "known", reason: "", hosts };

  const third = records.some((r) => r.thirdParty);
  const related = relatedPageSite(site, pageSites);
  const byName = guessFromName(topHost, site);
  const byTraffic = guessFromTraffic(records, third);

  if (byTraffic && byTraffic.cat === "browser") return { cat: "browser", owner: "", name: "", how: "guess", reason: byTraffic.reason, hosts };
  if (related) {
    return { cat: "related", owner: "", name: "", how: "guess",
      reason: `its name looks like ${related}` + (byName ? `, and ${byName.reason} (${SITE_CATEGORIES[byName.cat].label})` : ""), hosts };
  }
  const g = byName || byTraffic;
  if (g) return { cat: g.cat, owner: "", name: "", how: "guess", reason: g.reason, hosts };
  return { cat: "unknown", owner: "", name: "", how: "none", reason: "", hosts };
}

if (typeof module !== "undefined") {
  module.exports = { SITE_CATEGORIES, TRACKING_CATEGORIES, KNOWN_SITES, classifySite, classifyHost, lookupKnownSite, siteOfHost };
}
