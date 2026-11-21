// Works out what a site is built with, and turns generic fixes into steps for that platform.
import type { Finding } from "./types";

export type PlatformId = "wordpress" | "shopify" | "nextjs" | "nuxt" | "gatsby" | "wix" | "squarespace" | "webflow" | "magento" | "drupal" | "joomla";

export type Platform = {
  id: PlatformId;
  name: string;
  /** Plugins, page builders and services spotted on the page, by id. */
  extras: string[];
  extraNames: string[];
  cloudflare: boolean;
};

const NAMES: Record<PlatformId, string> = {
  wordpress: "WordPress",
  shopify: "Shopify",
  nextjs: "Next.js",
  nuxt: "Nuxt",
  gatsby: "Gatsby",
  wix: "Wix",
  squarespace: "Squarespace",
  webflow: "Webflow",
  magento: "Magento (Adobe Commerce)",
  drupal: "Drupal",
  joomla: "Joomla",
};

const EXTRAS: Record<string, string> = {
  "wp-rocket": "WP Rocket",
  litespeed: "LiteSpeed Cache",
  w3tc: "W3 Total Cache",
  wpfc: "WP Fastest Cache",
  autoptimize: "Autoptimize",
  elementor: "Elementor",
  woocommerce: "WooCommerce",
  divi: "Divi",
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
};

/** Signals from the raw HTML: comments, meta generator and inline globals. Kept small so only ids travel. */
export function htmlHints(html: string): string[] {
  const h: string[] = [];
  const gen = html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i)?.[1] ?? "";
  const test = (id: string, re: RegExp) => re.test(html) && h.push(id);
  if (/wordpress/i.test(gen)) h.push("wordpress");
  if (/wix\.com/i.test(gen)) h.push("wix");
  if (/squarespace/i.test(gen)) h.push("squarespace");
  if (/webflow/i.test(gen)) h.push("webflow");
  if (/drupal/i.test(gen)) h.push("drupal");
  if (/joomla/i.test(gen)) h.push("joomla");
  if (/elementor/i.test(gen)) h.push("elementor");
  if (/woocommerce/i.test(gen)) h.push("woocommerce");
  test("wordpress", /\/wp-(content|includes)\//i);
  test("shopify", /cdn\.shopify\.com|Shopify\.theme\b/);
  test("nextjs", /__NEXT_DATA__|\/_next\/static\//);
  test("nuxt", /\/_nuxt\/|window\.__NUXT__/);
  test("gatsby", /___gatsby|\/page-data\/app-data\.json/);
  test("wix", /static\.parastorage\.com|static\.wixstatic\.com/);
  test("squarespace", /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/);
  test("webflow", /data-wf-page=|website-files\.com/);
  test("magento", /Magento_|mage\/cookies|\/static\/version\d+\//);
  test("drupal", /Drupal\.settings|drupal-settings-json|\/sites\/default\/files\//);
  test("wp-rocket", /This website is like a Rocket|data-rocket-|\/wp-rocket\//i);
  test("litespeed", /LiteSpeed Cache|\/wp-content\/litespeed\//i);
  test("w3tc", /Performance optimized by W3 Total Cache|\/wp-content\/cache\/minify\//i);
  test("wpfc", /WP Fastest Cache/i);
  test("autoptimize", /\/wp-content\/cache\/autoptimize\//i);
  test("elementor", /\/wp-content\/plugins\/elementor\/|elementor-kit-/i);
  test("woocommerce", /\/plugins\/woocommerce\//i);
  test("divi", /\/themes\/Divi\//);
  test("yoast", /This site is optimized with the Yoast SEO/i);
  test("rankmath", /Rank Math WordPress SEO/i);
  test("cloudflare", /\/cdn-cgi\//);
  return [...new Set(h)];
}

const ORDER: PlatformId[] = ["shopify", "wix", "squarespace", "webflow", "nextjs", "nuxt", "gatsby", "magento", "drupal", "joomla", "wordpress"];

export function detectPlatform(requestUrls: string[], hints: string[] = []): Platform | null {
  const found = new Set(hints);
  for (const u of requestUrls) {
    const s = u.toLowerCase();
    if (/\/wp-(content|includes)\//.test(s)) found.add("wordpress");
    if (s.includes("cdn.shopify.com") || s.includes("/cdn/shop/")) found.add("shopify");
    if (s.includes("/_next/static/")) found.add("nextjs");
    if (s.includes("/_nuxt/")) found.add("nuxt");
    if (s.includes("/page-data/") && s.endsWith(".json")) found.add("gatsby");
    if (s.includes("static.parastorage.com") || s.includes("static.wixstatic.com")) found.add("wix");
    if (s.includes("squarespace.com") || s.includes("sqspcdn.com")) found.add("squarespace");
    if (s.includes("website-files.com")) found.add("webflow");
    if (/\/static\/version\d+\//.test(s)) found.add("magento");
    if (s.includes("/sites/default/files/")) found.add("drupal");
    if (s.includes("/cdn-cgi/")) found.add("cloudflare");
    if (s.includes("/wp-content/plugins/wp-rocket") || s.includes("/wp-content/cache/min/")) found.add("wp-rocket");
    if (s.includes("/wp-content/litespeed/")) found.add("litespeed");
    if (s.includes("/wp-content/cache/minify/")) found.add("w3tc");
    if (s.includes("/wp-content/cache/autoptimize/")) found.add("autoptimize");
    if (s.includes("/wp-content/plugins/elementor/") || s.includes("/elementor/css/")) found.add("elementor");
    if (s.includes("/plugins/woocommerce/")) found.add("woocommerce");
    if (s.includes("/themes/divi/")) found.add("divi");
  }
  const id = ORDER.find((p) => found.has(p));
  if (!id) return null;
  const extras = Object.keys(EXTRAS).filter((e) => found.has(e) && (id === "wordpress" || !["wp-rocket", "litespeed", "w3tc", "wpfc", "autoptimize", "elementor", "woocommerce", "divi", "yoast", "rankmath"].includes(e)));
  return { id, name: NAMES[id], extras, extraNames: extras.map((e) => EXTRAS[e]), cloudflare: found.has("cloudflare") };
}

// ---------- the steps ----------

type Ctx = { p: Platform; f: Finding; lcpFile?: string };
type StepFn = (c: Ctx) => string[] | null;

function wpCache(p: Platform): "wp-rocket" | "litespeed" | "w3tc" | "wpfc" | "autoptimize" | null {
  return (["wp-rocket", "litespeed", "w3tc", "wpfc", "autoptimize"] as const).find((x) => p.extras.includes(x)) ?? null;
}

const NO_PLUGIN = "You don't seem to have a speed plugin. Install one: LiteSpeed Cache (free) if your host runs LiteSpeed servers (Hostinger, A2 Hosting and many others do), otherwise WP Rocket (paid) or Autoptimize (free). Use only one, as two can conflict.";

function fileNames(f: Finding, n = 3) {
  return f.resources
    .slice(0, n)
    .map((r) => {
      try {
        return new URL(r.url).pathname.split("/").filter(Boolean).pop() ?? r.url;
      } catch {
        return r.url.split("/").pop() ?? r.url;
      }
    })
    .filter(Boolean);
}

const WP: Record<string, StepFn> = {
  "lcp-discovery-insight": ({ p, lcpFile }) => {
    const name = lcpFile ? `"${lcpFile}"` : "the main image's file name";
    const c = wpCache(p);
    const s: string[] = [];
    if (c === "wp-rocket") s.push(`WP Rocket → Media → LazyLoad: add ${name} to "Excluded images or iframes", then Save. Newer WP Rocket versions also have an option to optimise critical images automatically; turn it on if you see it.`);
    else if (c === "litespeed") s.push(`LiteSpeed Cache → Page Optimization → Media Excludes: add ${name} to "Lazy Load Image Excludes", then Save.`);
    else if (c === "autoptimize") s.push(`Autoptimize → Images: add ${name} to "Lazy-load exclusions", then Save.`);
    else if (c) s.push(`In your speed plugin's lazy-load settings, exclude ${name} from lazy loading.`);
    else s.push(`Since WordPress 5.5 images are lazy-loaded by default. Recent WordPress versions skip the first big image automatically; if yours doesn't, update WordPress, or exclude ${name} in your theme or a plugin like Perfmatters.`);
    if (p.extras.includes("elementor")) s.push("Elementor: if the main image is a section background, replace it with an Image widget. Background images are found late by the browser.");
    s.push("Clear the plugin cache (and your CDN cache) and run the test again.");
    return s;
  },
  "render-blocking-insight": ({ p, f }) => {
    const c = wpCache(p);
    const files = fileNames(f);
    const s: string[] = [];
    if (c === "wp-rocket") s.push('WP Rocket → File Optimization: turn on "Load JavaScript deferred" and "Delay JavaScript execution". Under CSS Files, turn on "Optimize CSS delivery" and choose "Remove Unused CSS".');
    else if (c === "litespeed") s.push('LiteSpeed Cache → Page Optimization → JS Settings: set "Load JS Deferred" to Deferred. CSS Settings: turn on "Load CSS Asynchronously" (it generates critical CSS for you).');
    else if (c === "autoptimize") s.push('Autoptimize → JS, CSS & HTML: tick "Optimize JavaScript Code" and "Do not aggregate but defer", then tick "Optimize CSS Code" and "Eliminate render-blocking CSS".');
    else if (c === "w3tc") s.push('W3 Total Cache → Performance → Minify: enable JS minify and set the embed type to "Non-blocking using defer". For CSS, consider adding a critical CSS plugin.');
    else if (c === "wpfc") s.push('WP Fastest Cache → Settings: tick "Minify Css", "Combine Css", "Combine Js" and, on Premium, "Render Blocking Js".');
    else s.push(NO_PLUGIN, "Then turn on its \"defer JavaScript\" and \"critical CSS\" (or \"load CSS asynchronously\") options.");
    if (files.length) s.push(`The files holding up the page are ${files.join(", ")}. If one belongs to a plugin you don't need on this page, unload it here with Perfmatters' Script Manager or Asset CleanUp.`);
    s.push("Check the page still looks and works right (menus, sliders, forms) after each change. If something breaks, exclude that one script from deferring.");
    return s;
  },
  "bootup-time": ({ p }) => {
    const c = wpCache(p);
    const s: string[] = [];
    if (c === "wp-rocket") s.push('WP Rocket → File Optimization: turn on "Delay JavaScript execution". Scripts then wait until the visitor scrolls, taps or moves the mouse.');
    else if (c === "litespeed") s.push('LiteSpeed Cache → Page Optimization → JS Settings: set "Load JS Deferred" to Delayed.');
    else s.push(NO_PLUGIN, 'Then turn on its "delay JavaScript until interaction" option (WP Rocket and LiteSpeed Cache both have one).');
    s.push("Deactivate plugins you don't use. Sliders, popups, chat widgets and social feeds are the usual heavy ones.");
    if (p.extras.includes("elementor")) s.push('Elementor → Settings → Features: turn on the performance experiments ("Optimized DOM Output", "Improved Asset Loading", "Improved CSS Loading"; names vary by version).');
    if (p.extras.includes("woocommerce")) s.push("WooCommerce loads its scripts on every page. Stop them loading on pages without a shop (Perfmatters or Asset CleanUp can do this).");
    return s;
  },
  "third-parties-insight": () => [
    "Open Google Tag Manager (or your header/footer scripts plugin) and remove tags nobody uses.",
    "For chat widgets and YouTube embeds, use a click-to-load version: WP Rocket's \"Replace YouTube iframe with preview image\", or a lite-embed plugin.",
    "Delay the rest until interaction with your speed plugin's \"delay JavaScript\" option.",
  ],
  "image-delivery-insight": ({ p }) => {
    const s: string[] = [];
    if (p.extras.includes("litespeed")) s.push("LiteSpeed Cache → Image Optimization: request optimisation and turn on \"Image WebP Replacement\" (it uses the free QUIC.cloud service).");
    else s.push("Install an image optimisation plugin (ShortPixel, Imagify or EWWW Image Optimizer) and turn on WebP or AVIF conversion. It converts existing images in bulk.");
    s.push("When you add an image to a page, choose a size close to how big it's shown (Image block → Resolution, or Elementor Image widget → Image Size). Don't use \"Full Size\" for small images.");
    s.push("Re-upload any photo that's thousands of pixels wide but shown small, resized first.");
    return s;
  },
  "unsized-images": ({ p }) => [
    p.extras.includes("wp-rocket") ? 'WP Rocket → Media: turn on "Add missing image dimensions".' : "Images added with the editor get width and height automatically. These are usually from the theme, a slider or a page builder.",
    "In page builders, set a fixed height or aspect ratio for sliders and image boxes.",
  ],
  "cls-culprits-insight": ({ p }) => [
    p.extras.includes("wp-rocket") ? 'WP Rocket → Media: turn on "Add missing image dimensions".' : "Make sure images have width and height (most image optimisation plugins can add them).",
    "Cookie banners, popups and promo bars should overlay the page, not push it down. In the plugin's settings choose a floating or overlay position.",
    "If the shift is caused by a web font, use fewer custom fonts or host them locally (OMGF plugin for Google Fonts).",
  ],
  "font-display-insight": ({ p }) => [
    p.extras.includes("litespeed") ? 'LiteSpeed Cache → Page Optimization → CSS Settings: set "Font Display Optimization" to Swap.' : "Host Google Fonts locally with the free OMGF plugin, which adds font-display: swap.",
    p.extras.includes("elementor") ? "Elementor → Settings → Advanced: set Google Fonts Load to \"Swap\", or turn off Google Fonts if your theme already loads them." : "Use at most two font families and only the weights you need.",
  ],
  "cache-insight": ({ p }) => {
    const c = wpCache(p);
    const s = [c === "litespeed" ? 'LiteSpeed Cache → Cache → Browser: turn on "Browser Cache".' : c ? "Your speed plugin adds browser caching rules automatically on Apache and LiteSpeed servers. Check it's switched on." : NO_PLUGIN];
    s.push("Files from other domains (Google, Facebook, chat tools) can't be changed by you. Ignore those in the list.");
    return s;
  },
  "document-latency-insight": ({ p }) => {
    const c = wpCache(p);
    const s: string[] = [];
    if (c === "litespeed") s.push("LiteSpeed Cache → Cache: make sure \"Enable Cache\" is on. Then check the page is actually served from cache (the response header x-litespeed-cache: hit).");
    else if (c) s.push("Make sure page caching is switched on in your speed plugin and that this page isn't excluded from cache.");
    else s.push(NO_PLUGIN);
    if (p.cloudflare) s.push("You use Cloudflare: Cloudflare's APO (Automatic Platform Optimization) for WordPress caches whole pages at Cloudflare's edge and usually cuts server time sharply.");
    s.push("Turn on the free CDN your host offers (Hostinger CDN, SiteGround CDN, etc.) or Cloudflare.");
    s.push("If it's still slow, the server is overloaded or a plugin is slow: Query Monitor shows which plugin takes the time.");
    return s;
  },
  "unused-css-rules": ({ p }) => [
    wpCache(p) === "wp-rocket" ? 'WP Rocket → File Optimization → Optimize CSS delivery: choose "Remove Unused CSS".' : wpCache(p) === "litespeed" ? 'LiteSpeed Cache → Page Optimization → CSS Settings: turn on "Generate UCSS".' : "Use a speed plugin with a \"remove unused CSS\" option (WP Rocket or LiteSpeed Cache).",
    "Stop plugins loading their CSS on pages that don't use them (Perfmatters or Asset CleanUp).",
  ],
  "unused-javascript": () => ["Stop plugins loading their scripts on pages that don't use them (Perfmatters or Asset CleanUp Script Manager).", "Delete plugins you've deactivated or don't need."],
  "unminified-css": ({ p }) => [wpCache(p) ? "Turn on CSS minification in your speed plugin." : NO_PLUGIN],
  "unminified-javascript": ({ p }) => [wpCache(p) ? "Turn on JavaScript minification in your speed plugin." : NO_PLUGIN],
  "dom-size-insight": ({ p }) => [
    p.extras.includes("elementor") ? "Elementor pages nest many containers. Rebuild heavy sections with Flexbox Containers instead of sections and columns, and remove hidden mobile/desktop duplicates." : "Remove sections hidden on mobile or desktop (they're still in the page), and split very long pages.",
    "Mega menus with hundreds of links add thousands of elements. Simplify them.",
  ],
  "viewport-insight": () => ["Your theme is missing the viewport tag. Switch to a modern theme, or add it with a header-scripts plugin (WPCode): <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"],
  "modern-http-insight": () => ["Ask your host to enable HTTP/2 or HTTP/3, or put the site behind Cloudflare, which serves HTTP/3 automatically."],
};

const SHOPIFY: Record<string, StepFn> = {
  "lcp-discovery-insight": () => [
    "Online Store → Themes → … → Edit code. Open the section that shows your main banner (often sections/image-banner.liquid or slideshow.liquid).",
    "Find the image_tag for the first image and make it load first: {{ section.settings.image | image_url: width: 1500 | image_tag: loading: 'eager', fetchpriority: 'high' }}",
    "If the banner is a slideshow, only the first slide should be eager; the rest can stay lazy.",
  ],
  "image-delivery-insight": () => [
    "Upload product and banner images at a sensible size (around 2000 px wide is plenty). Shopify's CDN converts them to WebP or AVIF automatically when the theme uses image_url.",
    "If the theme hard-codes image URLs, ask your developer to switch to image_url with widths: {{ image | image_url: width: 800 | image_tag: widths: '400, 800, 1200', sizes: '(min-width: 990px) 50vw, 100vw' }}",
  ],
  "render-blocking-insight": () => [
    "Most blocking scripts come from apps. Online Store → Themes → Customize → App embeds: turn off embeds you don't use.",
    "Uninstalling an app doesn't always remove its code. Check theme.liquid for leftover <script> tags and remove them.",
    "For scripts that must stay, add defer to the <script> tag in theme.liquid.",
  ],
  "bootup-time": () => [
    "Review Apps: each app often adds JavaScript to every page. Remove the ones you don't need.",
    "Turn off App embeds you don't use: Online Store → Themes → Customize → App embeds.",
    "Use Shopify's built-in features instead of apps where you can (reviews, product recommendations, search filters).",
  ],
  "third-parties-insight": () => ["Remove tracking pixels and apps you no longer use, and add tags through Shopify's Customer events (Settings → Customer events) so they don't block the page."],
  "unsized-images": () => ["Images output with image_tag get width and height automatically. These come from hard-coded <img> tags in the theme or app code; add width and height to them."],
  "cls-culprits-insight": () => ["Announcement bars and app popups that appear after load push the page down. Use the theme's built-in announcement bar, and set app popups to overlay mode.", "Give image banners a fixed aspect ratio in the theme settings."],
  "font-display-insight": () => ["In theme code, load fonts with font_display: 'swap': {{ settings.type_body_font | font_face: font_display: 'swap' }}", "Online Store → Themes → Customize → Typography: a system font loads instantly."],
  "document-latency-insight": () => ["Shopify runs the server, so you can't change hosting. Slow responses usually come from heavy Liquid code: too many products or collections per page, nested loops, or apps that hook into the page.", "Use Shopify Theme Inspector for Chrome to find the slow Liquid parts."],
  "cache-insight": () => ["Shopify caches its own files. The ones listed are usually from apps or other domains, which only the app makers can change."],
  "dom-size-insight": () => ["Reduce the number of products shown per collection page, and remove sections hidden on mobile."],
  "unused-javascript": () => ["Most unused JavaScript on Shopify comes from apps loading on every page. Remove apps you don't use and turn off their App embeds (Online Store → Themes → Customize → App embeds).", "Ask app makers whether their script can load only on the pages that need it (for example, reviews only on product pages)."],
  "unused-css-rules": () => ["Themes and apps ship CSS for every section. Remove unused sections and apps; a lighter, Online Store 2.0 theme such as Dawn loads much less CSS."],
};

const NEXT: Record<string, StepFn> = {
  "lcp-discovery-insight": () => ['Use next/image for the main image with loading="eager" and fetchPriority="high" (or the priority prop), and don\'t lazy-load it.', "If it's a CSS background, move it to an <Image> with fill so the browser finds it in the HTML."],
  "image-delivery-insight": () => ["Render images with next/image and give it a correct sizes prop, so it serves right-sized WebP or AVIF.", "If you use output: \"export\" or unoptimized images, resize and convert them at build time."],
  "render-blocking-insight": () => ["Load third-party scripts with next/script and strategy=\"afterInteractive\" or \"lazyOnload\" instead of a plain <script> in the layout.", "Global CSS is render-blocking: keep it small, and use CSS Modules or Tailwind so each route ships only its own CSS."],
  "bootup-time": () => ["Split heavy components with next/dynamic (and ssr: false for browser-only widgets).", "Keep components as Server Components where you can; only \"use client\" what needs interactivity.", "Load analytics and widgets with next/script strategy=\"lazyOnload\"."],
  "third-parties-insight": () => ["Use @next/third-parties for Google Tag Manager, Analytics and YouTube embeds; it loads them after the page is interactive."],
  "font-display-insight": () => ["Load fonts with next/font. It self-hosts them, adds font-display: swap and a size-matched fallback, which also prevents layout shift."],
  "cls-culprits-insight": () => ["next/image reserves space when width and height (or fill with a sized parent) are set.", "Use next/font so the fallback font matches the web font's size."],
  "unsized-images": () => ["Use next/image with width and height, or fill inside a parent with a fixed aspect ratio."],
  "document-latency-insight": () => ["Render this route statically or with ISR (revalidate) instead of on every request, or cache data fetches.", "If it must be dynamic, find the slow data call and cache it, or stream the slow part with Suspense."],
  "cache-insight": () => ["Next.js sets long caching for /_next/static automatically. Add Cache-Control headers for files in /public with headers() in next.config."],
  "unused-javascript": () => ["Check the bundle with @next/bundle-analyzer and split or replace large libraries."],
};

const WIX: Record<string, StepFn> = {
  _default: () => [
    "Wix runs the code and hosting, so most fixes are about what's on the page.",
    "Wix Dashboard → Analytics → Site Speed shows Google's real-visitor data for your site.",
  ],
  "lcp-discovery-insight": () => ["Use a single image at the top instead of a slideshow, gallery or video background.", "Remove entrance animations from the first screen; they delay when the main content counts as shown."],
  "image-delivery-insight": () => ["Wix converts images to WebP automatically. Replace very large uploads with images resized to how they're shown, and avoid GIFs."],
  "bootup-time": () => ["Remove Wix apps you don't use (Dashboard → Apps), and remove embeds (HTML iframes) from this page.", "Settings → Custom Code: set tracking scripts to load in \"Body - end\"."],
  "third-parties-insight": () => ["Settings → Custom Code: remove unused scripts and set the rest to \"Body - end\". Use Wix's built-in Marketing Integrations for Google and Facebook."],
  "render-blocking-insight": () => ["Settings → Custom Code: move scripts from \"Head\" to \"Body - end\"."],
  "font-display-insight": () => ["Use two fonts at most and avoid uploaded custom fonts on the first screen."],
};

const SQUARESPACE: Record<string, StepFn> = {
  _default: () => ["Squarespace runs the code and hosting, so most fixes are about what's on the page."],
  "lcp-discovery-insight": () => ["Use a single image banner at the top instead of a video background or gallery slideshow.", "Turn off image animations (Site Styles → Animations) for the first section."],
  "image-delivery-insight": () => ["Upload images no wider than 2,500 px and under about 500 KB. Squarespace makes resized versions, but huge originals still slow the first view."],
  "bootup-time": () => ["Remove code blocks, embeds and Code Injection scripts you don't need (Settings → Advanced → Code Injection, or Website → Pages → Custom Code)."],
  "third-parties-insight": () => ["Remove unused scripts from Code Injection and use Squarespace's built-in integrations where possible."],
  "font-display-insight": () => ["Use fewer font families and weights in Site Styles → Fonts."],
};

const WEBFLOW: Record<string, StepFn> = {
  "lcp-discovery-insight": () => ['Select the main image → Element settings (gear icon) → set Load to "Eager".', "If it's a background image on a section, swap it for an Image element."],
  "image-delivery-insight": () => ["Assets panel: select large images and convert them to WebP or AVIF, and compress them.", "Upload images close to the size they're shown; Webflow makes responsive versions automatically."],
  "render-blocking-insight": () => ["Site settings → Custom code: move scripts from Head code to Footer code, and add defer to any that must stay in the head."],
  "bootup-time": () => ["Remove unused Interactions on the first screen and custom code embeds you don't need.", "Move third-party scripts to Footer code."],
  "third-parties-insight": () => ["Move tracking and chat scripts to Footer code, and remove unused ones."],
  "unsized-images": () => ["Set width and height (or an aspect ratio) on image wrappers so space is reserved."],
};

const STEPS: Partial<Record<PlatformId, Record<string, StepFn>>> = {
  wordpress: WP,
  shopify: SHOPIFY,
  nextjs: NEXT,
  wix: WIX,
  squarespace: SQUARESPACE,
  webflow: WEBFLOW,
};

/** Adds platform steps to each finding where we have them. */
export function addPlatformSteps(findings: Finding[], p: Platform | null, lcpUrl?: string) {
  if (!p) return;
  const table = STEPS[p.id];
  if (!table) return;
  const lcpFile = lcpUrl ? lcpUrl.split("?")[0].split("/").pop() : undefined;
  for (const f of findings) {
    const fn = table[f.auditId] ?? table._default;
    const steps = fn?.({ p, f, lcpFile });
    if (steps?.length) f.platformSteps = { title: platformTitle(p), steps };
  }
}

export function platformTitle(p: Platform) {
  const plugin = p.id === "wordpress" ? p.extraNames.filter((n) => !["Yoast SEO", "Rank Math"].includes(n)) : [];
  return `On your ${p.name} site${plugin.length ? ` (with ${plugin.join(", ")})` : ""}`;
}
