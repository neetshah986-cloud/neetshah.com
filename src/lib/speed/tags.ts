// Marketing, analytics and chat tools named in a page's HTML. Used to spot tools that are on the page
// but didn't load during Google's test (delayed until after load or until a visitor interacts).

export type HtmlTag = { name: string; viaShopifyPixels: boolean };

/** html: a pattern in the page HTML; loaded: a pattern in request URLs that shows it actually downloaded. */
const TAGS: { name: string; html: RegExp; loaded: RegExp }[] = [
  { name: "Google Tag Manager", html: /["'\\/=]GTM-[A-Z0-9]{5,9}\b/, loaded: /googletagmanager\.com\/gtm\.js/ },
  { name: "Google Analytics", html: /["'\\/=]G-[A-Z0-9]{8,12}\b|google-analytics\.com\/(analytics|ga)\.js/, loaded: /googletagmanager\.com\/gtag\/js|google-analytics\.com|analytics\.google\.com/ },
  { name: "Google Ads", html: /["'\\/=]AW-\d{8,12}\b/, loaded: /googletagmanager\.com\/gtag\/js|googleadservices\.com|googlesyndication\.com|doubleclick\.net/ },
  { name: "Facebook Pixel", html: /connect\.facebook\.net\/[^"'\s]*fbevents|fbq\(\s*\\?["']init|facebook_pixel/, loaded: /connect\.facebook\.net|facebook\.com\/tr/ },
  { name: "Microsoft Clarity", html: /clarity\.ms\/tag/, loaded: /clarity\.ms/ },
  { name: "Hotjar", html: /static\.hotjar\.com|\bhjid\b/, loaded: /hotjar\.com/ },
  { name: "TikTok Pixel", html: /analytics\.tiktok\.com|ttq\.load\(|tiktok_pixel/, loaded: /analytics\.tiktok\.com/ },
  { name: "Pinterest Tag", html: /s\.pinimg\.com\/ct\/|pintrk\(/, loaded: /pinimg\.com\/ct|ct\.pinterest\.com/ },
  { name: "Snap Pixel", html: /sc-static\.net\/scevent/, loaded: /sc-static\.net|tr\.snapchat\.com/ },
  { name: "LinkedIn Insight Tag", html: /snap\.licdn\.com|_linkedin_partner_id/, loaded: /licdn\.com|linkedin\.com\/(px|collect)/ },
  { name: "Microsoft Ads (UET)", html: /bat\.bing\.com\/bat\.js/, loaded: /bat\.bing\.com/ },
  { name: "Klaviyo", html: /static\.klaviyo\.com/, loaded: /klaviyo\.com/ },
  { name: "MoEngage", html: /cdn\.moengage\.com|moengage_object/i, loaded: /moengage\.com/ },
  { name: "CleverTap", html: /clevertap/i, loaded: /clevertap/ },
  { name: "WebEngage", html: /webengage\.com/i, loaded: /webengage\.com/ },
  { name: "VWO", html: /visualwebsiteoptimizer\.com|_vwo_code/, loaded: /visualwebsiteoptimizer\.com|vwo\.com/ },
  { name: "Intercom", html: /widget\.intercom\.io/, loaded: /intercom\.io|intercomcdn\.com/ },
  { name: "Tawk.to", html: /embed\.tawk\.to/, loaded: /tawk\.to/ },
  { name: "Zendesk chat", html: /static\.zdassets\.com/, loaded: /zdassets\.com|zendesk\.com/ },
  { name: "Freshchat", html: /wchat\.freshchat\.com|fw-cdn\.com/, loaded: /freshchat\.com|fw-cdn\.com/ },
  { name: "Crisp chat", html: /client\.crisp\.chat/, loaded: /crisp\.chat/ },
  { name: "Tidio", html: /code\.tidio\.co/, loaded: /tidio\.co/ },
  { name: "HubSpot", html: /js\.hs-scripts\.com|js\.hsforms\.net/, loaded: /hs-scripts\.com|hsforms\.net|hubspot\.com/ },
  { name: "YouTube embed", html: /youtube(-nocookie)?\.com\/embed\//, loaded: /youtube(-nocookie)?\.com|ytimg\.com/ },
  { name: "Vimeo embed", html: /player\.vimeo\.com/, loaded: /vimeo\.com|vimeocdn\.com/ },
];

/** Tools named in the HTML. Shopify Customer events pixels are recognised inside webPixelsConfigList. */
export function htmlTags(html: string): HtmlTag[] {
  const start = html.indexOf("webPixelsConfigList");
  const pixels = start >= 0 ? html.slice(start, start + 60_000) : "";
  const out: HtmlTag[] = [];
  for (const t of TAGS) {
    const inPixels = !!pixels && t.html.test(pixels);
    if (inPixels || t.html.test(html)) out.push({ name: t.name, viaShopifyPixels: inPixels });
  }
  return out;
}

/** Tools in the HTML that made no request during the test. */
export function notLoaded(tags: HtmlTag[], urls: string[]): HtmlTag[] {
  return tags.filter((tag) => {
    const t = TAGS.find((x) => x.name === tag.name);
    return t ? !urls.some((u) => t.loaded.test(u)) : false;
  });
}
